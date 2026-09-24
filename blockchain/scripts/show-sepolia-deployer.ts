import { network } from "hardhat";

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();
const activeNetwork = await ethers.provider.getNetwork();
const balance = await ethers.provider.getBalance(deployer.address);

console.log(
  JSON.stringify(
    {
      chainId: Number(activeNetwork.chainId),
      networkName: activeNetwork.name,
      deployer: deployer.address,
      balanceEth: ethers.formatEther(balance),
    },
    null,
    2
  )
);
