import {describe,it,expect} from 'vitest';
import {KeyPair,addSessionKey,deleteKey,fnCall} from '@mempire/sdk';
import {toWalletActions,fromWalletActions} from './wallet-actions';
import {najActionToInternal} from '@near-wallet-selector/core';
describe('wallet action bridge',()=>{
 it('round-trips play-only AddKey, stake and DeleteKey through the same codec Meteor uses',()=>{
  const key=KeyPair.fromRandom('ed25519').getPublicKey().toString();
  const add=addSessionKey(key,'mempire-arena-41966.testnet',['play'],250000000000000000000000n);
  const wallet=toWalletActions([add,fnCall('challenge_house',{house:0,format:1,deck:[0,1,2,3,4,5,6,8],session_key:key},30,'10000000000000000000000'),deleteKey(key)]);
  const internal=wallet.map(najActionToInternal);
  expect(internal[0]).toMatchObject({type:'AddKey',params:{accessKey:{permission:{receiverId:'mempire-arena-41966.testnet',methodNames:['play'],allowance:'250000000000000000000000'}}}});
  const back=fromWalletActions(wallet);
  expect(back[0].addKey?.accessKey.permission.functionCall?.methodNames).toEqual(['play']);
  expect(back[1].functionCall?.deposit).toBe(10000000000000000000000n);
  expect(back[2].deleteKey?.publicKey.toString()).toBe(key);
 });
});
