/* eslint-disable @typescript-eslint/require-await */
import { Block, OutPoint } from "@node-lightning/bitcoin";
import { ChannelReadyMessage } from "../../../messages/ChannelReadyMessage";
import { Channel } from "../../Channel";
import { StateMachine } from "../../StateMachine";
import { FailingState } from "../FailingState";
import { NormalState } from "../NormalState";
import { AwaitingChannelReadyState } from "./AwaitingChannelReadyState";

export class AwaitingFundingDepthState extends StateMachine {
    public async onChannelReadyMessage(
        channel: Channel,
        msg: ChannelReadyMessage,
    ): Promise<string> {
        this.logger.debug("processing channel_ready message");

        // Validate received message
        const isValid = this.logic.validateChannelReadyMessage(channel, msg);
        if (!isValid) {
            this.logger.warn("channel_ready validation failed");
            return FailingState.name;
        }

        // Capture the second_per_commitment_point on the channel
        channel.attachChannelReady(msg);

        // Stay in the same state until the funding depth has been reached
        return AwaitingFundingDepthState.name;
    }

    public async onBlockConnected(channel: Channel, block: Block): Promise<string> {
        // If the funding transaction hasn't been confirmed yet we perform
        if (!channel.fundingConfirmedHeight) {
            // If the block contains our funding transaction then we mark the
            // depth and transition to the awaiting_funding_depth state
            if (containsOutPoint(block, channel.fundingOutPoint)) {
                const confirmedHeight = Number(block.bip34Height);
                channel.markConfirmed(confirmedHeight);
                return AwaitingFundingDepthState.name;
            }

            // Otherwise we keep waiting
            return AwaitingFundingDepthState.name;
        }

        // When block height reaches ready height...
        if (block.bip34Height >= channel.readyHeight) {
            this.logger.debug("channel funding depth has been reached");
            // Construct the channel ready message and transition
            // to either the awaiting_channel_ready state if we haven't
            // received the channel ready message or we transition to
            // Normal state
            const msg = await this.logic.createChannelReadyMessage(channel);

            // Send the message to the peer
            await this.logic.sendMessage(channel.peerId, msg);

            // If we already have the `channel_ready` message we can
            // transition to the normal state
            if (channel.hasChannelReady) {
                return NormalState.name;
            }
            // Otherwise we transition to waiting for the `channel_ready`
            // message
            else {
                return AwaitingChannelReadyState.name;
            }
        }

        // Otherwise we're between the confirmed height and the ready height
        // so we stay here and wait for blocks to be solved.
        return AwaitingFundingDepthState.name;
    }
}

/**
 * Checks if a block contains an outpoint
 * @param block
 * @param target
 * @returns
 */
function containsOutPoint(block: Block, target: OutPoint): boolean {
    for (const tx of block.txs) {
        for (let i = 0; i < tx.outputs.length; i++) {
            const outpoint = new OutPoint(tx.txId, i);
            if (target.eq(outpoint)) return true;
        }
    }
    return false;
}

// /**
//  * Performs a scan of the block for an outpoint spend and returns true
//  * if one is found.
//  * @param block
//  * @param outpoint
//  * @returns
//  */
// function spendsOutPoint(block: Block, outpoint: OutPoint): boolean {
//     for (const tx of block.txs) {
//         for (const vin of tx.inputs) {
//             if (vin.outpoint.eq(outpoint)) {
//                 return true;
//             }
//         }
//     }
//     return false;
// }
