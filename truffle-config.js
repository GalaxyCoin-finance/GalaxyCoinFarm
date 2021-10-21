const HDWalletProvider = require('@truffle/hdwallet-provider');
const NonceTrackerSubprovider = require("web3-provider-engine/subproviders/nonce-tracker")

require('dotenv').config();
const secrets = require('./secrets.json');

module.exports = {
    networks: {
        development: {
            network_id: '*',
            host: 'localhost',
            port: process.env.PORT
        },
        polygon: {
            provider: function () {
                const wallet = new HDWalletProvider(secrets.polygon.mnemonic, secrets.polygon.rpcURL)
                const nonceTracker = new NonceTrackerSubprovider()
                wallet.engine._providers.unshift(nonceTracker)
                nonceTracker.setEngine(wallet.engine)
                return wallet
            },
            network_id: 137,
            confirmations: 2,
            //websockets: true
        },
        mumbai: {
            provider: function () {
                const wallet = new HDWalletProvider(secrets.mumbai.mnemonic, secrets.mumbai.rpcURL)
                const nonceTracker = new NonceTrackerSubprovider()
                wallet.engine._providers.unshift(nonceTracker)
                nonceTracker.setEngine(wallet.engine)
                return wallet
            },
            network_id: 80001,
            confirmations: 2,
            //websockets: true
        },
        kovan: {
            provider: function () {
                const wallet = new HDWalletProvider(secrets.kovan.mnemonic, secrets.kovan.rpcURL)
                const nonceTracker = new NonceTrackerSubprovider()
                wallet.engine._providers.unshift(nonceTracker)
                nonceTracker.setEngine(wallet.engine)
                return wallet
            },
            network_id: 42,
            gas: 12450000,
            gasPrice: 20000000000,
            confirmations: 2,
            skipDryRun: true,
            //websockets: true
        },
        bsctestnet: {
            provider: function () {
                const wallet = new HDWalletProvider(secrets.bsctestnet.mnemonic, secrets.bsctestnet.rpcURL)
                const nonceTracker = new NonceTrackerSubprovider()
                wallet.engine._providers.unshift(nonceTracker)
                nonceTracker.setEngine(wallet.engine)
                return wallet
            },
            network_id: 97,
            confirmations: 2,
            timeoutBlocks: 2000,
            networkCheckTimeout: 1000000000,
            skipDryRun: true
        },
        bsc: {
            provider: function () {
                const wallet = new HDWalletProvider(secrets.bsc.mnemonic, secrets.bsc.rpcURL)
                const nonceTracker = new NonceTrackerSubprovider()
                wallet.engine._providers.unshift(nonceTracker)
                nonceTracker.setEngine(wallet.engine)
                return wallet
            },
            network_id: 56,
            confirmations: 20,
            timeoutBlocks: 2000,
            networkCheckTimeout: 1000000000,
            skipDryRun: true
        }
    },
    compilers: {
        solc: {
            version: "0.8.4",
        }
    },
    plugins: [
        'truffle-plugin-verify'
    ],
    api_keys: {
        bscscan: secrets.bsc.explorerApiKEy,
        etherscan: secrets.kovan.explorerApiKEy,
        polygonscan: secrets.polygon.explorerApiKEy
    }
};