var fs = require('fs');

var Farm = artifacts.require("../contracts/Farm.sol");
var GalaxyCoin = artifacts.require("../contracts/GalaxyCoin.sol");

const configs = require("../config.json");
const contracts = require("../contracts.json");
const GalaxyABI = require("../abi/GalaxyCoin.json")

module.exports = async function(deployer) {
  try {
    
    let dataParse = contracts;

    if (configs.lpExist) {
      if (!configs.Farm) {
        console.log("sdf");
        const currentBlock = await web3.eth.getBlockNumber();
        const startBlock = configs.farm_param.startBlock
            || web3.utils.toBN(currentBlock).add(web3.utils.toBN(configs.farm_param.delay));

        await deployer.deploy(Farm, dataParse['GalaxyCoin'], web3.utils.toBN(configs.farm_param.rewardPerBlock), startBlock, configs.farm_param.adminWalletAddr, {
          gas: 5000000
        });
        const farmInstance = await Farm.deployed();
        dataParse['Farm'] = Farm.address;
        if (configs.farm_param.fund) {
         // const galaxyCoinInstance = await GalaxyCoin.at(dataParse['GalaxyCoin']);
          const galaxyCoinContract = new web3.eth.Contract(GalaxyABI,dataParse['GalaxyCoin']);
         // const galaxyCoinInstance = await galaxyCoinContract.at(dataParse['GalaxyCoin']);
          await galaxyCoinContract.methods.approve(Farm.address, web3.utils.toBN(configs.farm_param.fund)).call();
          await farmInstance.fund(web3.utils.toBN(configs.farm_param.fund));
        }
        for (let i = 0; i < configs.farm_param.lp.length; i ++) {
          const token = configs.farm_param.lp[i];
          if (token.address) {
            await farmInstance.add(
              token.allocPoint,
              token.address,
              token.withdrawFee,
              token.calimFee,
              false
            );
          }
        }
      }
      else {
        dataParse['Farm'] = configs.Farm;
      }      
    }

    const updatedData = JSON.stringify(dataParse);
		await fs.promises.writeFile('contracts.json', updatedData);

  } catch (error) {
    console.log(error);
  }

};
