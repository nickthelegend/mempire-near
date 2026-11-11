export const readableChainError=(e:unknown)=>e instanceof Error?e.message:String(e);
export async function mintCardTx(_id:number):Promise<{hash:string}>{throw new Error('NFT minting is not on NEAR yet. All supported fighters are free.');}
export async function upgradeCardTx(_keep:number,_burn:number):Promise<{hash:string}>{throw new Error('Card upgrades are not on NEAR yet.');}
