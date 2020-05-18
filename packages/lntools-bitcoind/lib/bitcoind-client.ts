import { EventEmitter } from "events";
import * as zmq from "zeromq";
import { IBitcoindOptions } from "./bitcoind-options";
import { jsonrpcRequest } from "./jsonrpc-request";
import { BlockChainInfo } from "./types/block-chain-info";
import { BlockSummary } from "./types/blocksummary";
import { Transaction } from "./types/transaction";
import { Utxo } from "./types/transaction";

export declare interface IBitcoindClient {
  on(event: "rawtx", listener: (rawtx: Buffer) => void): this;
  on(event: "rawblock", listener: (rawblock: Buffer) => void): this;
}

/**
 * Bitcoind RPC and Zeromq client
 */
export class BitcoindClient extends EventEmitter {
  public opts: IBitcoindOptions;
  public id: number;

  public rawTxSock: zmq.socket;
  public rawBlockSock: zmq.socket;

  constructor(opts: IBitcoindOptions) {
    super();
    this.opts = opts;
    this.id = 0;
  }

  /**
   * Subscribes to the raw transaction ZeroMQ stream and emits
   * rawtx events with a Buffer payload
   * @emits rawtx
   */
  public subscribeRawTx() {
    const sock = (this.rawTxSock = zmq.socket("sub"));
    sock.connect(this.opts.zmqpubrawtx);
    sock.subscribe("rawtx");
    sock.on("message", (topic: string, message: Buffer) => this.emit("rawtx", message));
  }

  /**
   * Subscribes to the raw block ZeroMQ stream and emits
   * rawblock events with a Buffer payload.
   * @emits rawblock
   */
  public subscribeRawBlock() {
    const sock = (this.rawBlockSock = zmq.socket("sub"));
    sock.connect(this.opts.zmqpubrawblock);
    sock.subscribe("rawblock");
    sock.on("message", (topic: string, message: Buffer) => this.emit("rawblock", message));
  }

  /**
   * Gets the BlockChaininfo using the `getblockchaininfo` RPC method
   */
  public async getBlockchainInfo(): Promise<BlockChainInfo> {
    return this._jsonrpc<BlockChainInfo>("getblockchaininfo");
  }

  /**
   * Gets the block hash for a given block height. Hash is returned in RPC byte
   * order using the `getblockhash` RPC method
   * @param height
   */
  public async getBlockHash(height: number): Promise<string> {
    return this._jsonrpc<string>("getblockhash", [height]);
  }

  /**
   * Gets a BlockSummary object, which only includes the transaction identifiers
   * using the `getblock` RPC method
   * @param hash
   */
  public async getBlock(hash: string): Promise<BlockSummary> {
    return this._jsonrpc<BlockSummary>("getblock", [hash]);
  }

  /**
   * Gets a raw block as a Buffer use the `getblock` RPC method
   * @param hash
   */
  public async getRawBlock(hash: string): Promise<Buffer> {
    const result = await this._jsonrpc<string>("getblock", [hash, 0]);
    return Buffer.from(result, "hex");
  }

  /**
   * Gets a parsed transaction using the `getrawtransaction` method
   * @param txid
   */
  public async getTransaction(txid: string): Promise<Transaction> {
    return this._jsonrpc<Transaction>("getrawtransaction", [txid, true]);
  }

  /**
   * Gets a raw transaction as a buffer using the `getrawtransaction` RPC method
   * @param txid
   */
  public async getRawTransaction(txid: string): Promise<Buffer> {
    const result = await this._jsonrpc<string>("getrawtransaction", [txid, false]);
    return Buffer.from(result, "hex");
  }

  /**
   * Retrieves the UTXO value using the gettxout rpc method
   * @param txid
   * @param n
   */
  public async getUtxo(txid: string, n: number): Promise<Utxo> {
    return await this._jsonrpc<Utxo>("gettxout", [txid, n]);
  }

  /**
   * Performs a json-rpc requets using the configured options for the client.
   * @param method
   * @param args
   */
  private _jsonrpc<T>(method: string, args?: any): Promise<T> {
    // constructs a request delegate that will be used for retries
    const fn = () => jsonrpcRequest<T>(method, args, ++this.id, this.opts);

    // if we have a retry policy specified in the options, we will build a
    // new policy for this request and use it to execute our function delegate
    if (this.opts.policyMaker) {
      return this.opts.policyMaker<T>().execute(fn);
    }
    // otherwise just directly invoke our function request
    else {
      return fn();
    }
  }
}
