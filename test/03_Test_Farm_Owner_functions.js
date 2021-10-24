const Farm = artifacts.require('./Farm.sol');
const ERC20 = artifacts.require('./test/ERC20Mock.sol');
const LP = artifacts.require('./test/LPMock.sol');
const {waitUntilBlock} = require('./helpers/tempo')(web3);
const truffleAssert = require('truffle-assertions');
const {toWei} = web3.utils;
const zeroAddress = "0x0000000000000000000000000000000000000000"
contract('Farm Special Functions', ([owner, alice, bob, carl, adminWallet, adminWallet2]) => {
    before(async () => {
        this.erc20 = await ERC20.new("Mock token", "MOCK", toWei('1000000000'));
        let balance = await this.erc20.balanceOf(owner);
        assert.equal(balance.valueOf(), toWei('1000000000'));

        this.lp = await LP.new("LP Token", "LP");
        this.lp2 = await LP.new("LP Token 2", "LP2");

        const currentBlock = await web3.eth.getBlockNumber();
        this.startBlock = currentBlock + 100;

        this.farm = await Farm.new(this.erc20.address, toWei('100'), this.startBlock, adminWallet);
        // withdrawal fee of 5% (argument/1000)
        this.farm.add(15, this.lp.address, 50, 60);

        await this.erc20.approve(this.farm.address, toWei('5000000'));
        await this.farm.fund(toWei('5000000'));
    });

    before(async () => {
        await Promise.all([
            this.lp.mint(alice, toWei('5000')),
            this.lp.mint(bob, toWei('500')),
            this.lp.mint(carl, toWei('2000')),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp.balanceOf(alice),
            this.lp.balanceOf(bob),
            this.lp.balanceOf(carl),
        ]);

        assert.equal(toWei('5000'), balanceAlice);
        assert.equal(toWei('500'), balanceBob);
        assert.equal(toWei('2000'), balanceCarl);
    });

    before(async () => {
        await Promise.all([
            this.lp2.mint(alice, toWei('1000')),
            this.lp2.mint(carl, toWei('800')),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp2.balanceOf(alice),
            this.lp2.balanceOf(bob),
            this.lp2.balanceOf(carl),
        ]);

        assert.equal(toWei('1000'), balanceAlice);
        assert.equal(toWei('0'), balanceBob);
        assert.equal(toWei('800'), balanceCarl);
    });

    describe('Deployments and before initializations', async () => {
        it('Deploys without init', async () => {
            this.farm2 = await Farm.new(zeroAddress, 0, 0, zeroAddress);
        });

        it('Fails to fund', async () => {
            await this.erc20.approve(this.farm2.address, toWei('5000000'));

            await truffleAssert.reverts(
                this.farm2.fund(toWei('5000000')),
                "Farm: init the farm first"
            );
        });

        it('Fails to add', async () => {
            await truffleAssert.reverts(
                this.farm2.add(15, this.lp.address, 50, 60),
                "Farm: init the farm first"
            );
        });

        it('Initialized normally ', async () => {
            const currentBlock = await web3.eth.getBlockNumber();
            this.startBlock2 = currentBlock + 100;
            await this.farm2.initializeFarm(this.erc20.address, toWei('10'), this.startBlock2, adminWallet2);
            assert.equal(this.startBlock2, await this.farm2.startBlock());
            assert.equal(toWei('10'), await this.farm2.rewardPerBlock());
        });

        it("Only initializes once in it's life time", async () => {
            await truffleAssert.reverts(
                this.farm2.initializeFarm(this.erc20.address, toWei('10'), this.startBlock2, adminWallet2),
                "initializeFarm: Already initialized"
            );
        });

    });

    describe('when created', () => {

        it('is initialized for the LP token', async () => {
            const poolLength = await this.farm.poolLength();
            assert.equal(1, poolLength);

            const poolInfo = await this.farm.poolInfo(0);
            assert.equal(poolInfo[0], this.lp.address);
            assert.equal(poolInfo[1].words[0], 15);
            assert.equal(poolInfo[4].words[0], 50);
            assert.equal(poolInfo[5].words[0], 60);


            const totalAllocPoint = await this.farm.totalAllocPoint();
            assert.equal(totalAllocPoint, 15);
        });

        it('holds 5000000 MOCK', async () => {
            const balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('5000000'))
        });

        it('will run for 50000 blocks', async () => {
            const endBlock = await this.farm.endBlock();
            assert.equal(50000, endBlock - this.startBlock);
        });

        it('Fails to fund with a non dividable on rewards per block', async () => {
            await this.erc20.approve(this.farm.address, toWei('15555'));

            await truffleAssert.reverts(
                this.farm.fund(toWei('15555')),
                "fund: _amount not dividable by rewardPerBlock"
            );
        });
    });

    describe('before the start block', () => {
        before(async () => {
            await Promise.all([
                this.lp.approve(this.farm.address, toWei('1500'), {from: alice}),
                this.lp.approve(this.farm.address, toWei('500'), {from: bob})
            ]);

            await Promise.all([
                this.farm.deposit(0, toWei('1500'), {from: alice}),
                this.farm.deposit(0, toWei('500'), {from: bob})
            ]);
        });

        it('Reducing rewards per block push the end block to the future and avoids division precision loss', async () => {
            await this.farm.changeRewardPerBlock(toWei('60'));

            const adminBalance = await this.erc20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('20'));

            const endBlock = await this.farm.endBlock();
            assert.equal(83333, endBlock - this.startBlock);

            const balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('4999980'));
        });

        it('Increasing rewards per block pushes the endblock closer and avoids division precision loss', async () => {
            await this.farm.changeRewardPerBlock(toWei('100'));

            const adminBalance = await this.erc20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('100')); // 20 from last call and 80 for the current call 

            const endBlock = await this.farm.endBlock();
            assert.equal(50000 - 1, endBlock - this.startBlock);

            let balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('4999900'));

            await this.erc20.approve(this.farm.address, toWei('100'));
            await this.farm.fund(toWei('100'));

            balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('5000000'));
        })

        it('Allows participants to join', async () => {
            const balanceFarm = await this.lp.balanceOf(this.farm.address);
            assert.equal(toWei('2000'), balanceFarm);

            const balanceAlice = await this.lp.balanceOf(alice);
            const depositAlice = await this.farm.deposited(0, alice);
            assert.equal(toWei('3500'), balanceAlice);
            assert.equal(toWei('1500'), depositAlice);

            const balanceBob = await this.lp.balanceOf(bob);
            const depositBob = await this.farm.deposited(0, bob);
            assert.equal(toWei('0'), balanceBob);
            assert.equal(toWei('500'), depositBob);
        });

        it('Does not assign any rewards yet', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(0, totalPending);
        });
    })

    describe('after 10 blocks of farming', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 10);
        });

        it('reserved 750 for alice and 250 for bob', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('750'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('250'), pendingBob);
        });
    });

    describe('with a 3th participant after 30 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 28);

            await this.lp.approve(this.farm.address, toWei('2000'), {from: carl});
            await this.farm.deposit(0, toWei('2000'), {from: carl});
        });

        it('reserved 2250 for alice, 750 for bob, and nothing for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('2250'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('750'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('0'), pendingCarl);
        });
    });

    describe('Farming after 50 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 50);
        });

        it('reserved 3000 for alice, 1000 for bob, and 1000 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('3000'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('1000'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('1000'), pendingCarl);
        });

        it('Increasing rewards per block pushes the endblock closer', async () => {
            await this.farm.changeRewardPerBlock(toWei('200'));

            const endBlock = await this.farm.endBlock();
            assert.equal(25025, endBlock - this.startBlock);

            const balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('4999900'));

            const lastAmount = await this.farm.rewardsAmountBeforeLastChange();
            assert.equal(lastAmount, toWei('5100')); // 51 blocks at 100 per block

            const lastChnage = await this.farm.lastEmissionChange();
            assert.equal(lastChnage - await this.farm.startBlock(), 51);

            const adminBalance = await this.erc20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('200')); // 100 from the two first tests and 100 from the current one
        });

        it('Did not messup the rewards after rewards changing', async () => {
            await waitUntilBlock(10, this.startBlock + 60);

            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('3712.5'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('1237.5'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('1950'), pendingCarl);
        });

        it('Decreasing rewards per block pushes the endblock further to the future', async () => {
            await this.farm.changeRewardPerBlock(toWei('100'));

            const endBlock = await this.farm.endBlock();
            assert.equal(49989, endBlock - this.startBlock);

            const balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('4999900'));

            const lastAmount = await this.farm.rewardsAmountBeforeLastChange();
            assert.equal(lastAmount, toWei('7100')); // 51 blocks at 100 per block + 10 blocks at 200 per block

            const lastChnage = await this.farm.lastEmissionChange();
            assert.equal(lastChnage - await this.farm.startBlock(), 61);

            const adminBalance = await this.erc20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('200')); // 100 from the two first tests and 100 from the current one
        });

        it('Did not messup the rewards after rewards changing', async () => {
            await waitUntilBlock(10, this.startBlock + 70);

            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('4125'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('1375'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('2500'), pendingCarl);

            const lastChnage = await this.farm.lastEmissionChange();
            assert.equal(lastChnage - await this.farm.startBlock(), 61);

        });

        it('Has the right amount of pending', async () => {
            // 7100 + 100 *9 = 8000?
            const totalPending = await this.farm.totalPending();
            assert.equal(toWei("8000"), totalPending);
        });

    });

    describe('Widrawal after 70 blocks', async () => {
        before(async () => {
            await this.farm.withdraw(0, toWei('1500'), {from: alice});
        });

        it('should claim 3912.75 GAX for Alice', async () => {
            const aliceBalance = await this.erc20.balanceOf(alice);
            assert.equal(toWei("3912.75"), aliceBalance);
        });

        it('should send 249.75 GAX to admin as claimFee', async () => {
            const adminBalance = await this.erc20.balanceOf(adminWallet);
            assert.equal(toWei("449.75"), adminBalance); // 200 GAx was already in wallet
        });

        it('should send 75 LP to admin as withdrawal fee', async () => {
            const adminBalance = await this.lp.balanceOf(adminWallet);
            assert.equal(toWei("75"), adminBalance);
        });

    });

    describe('Change widrawal address', async () => {//adminWallet2
        before(async () => {
            await this.farm.changeAdminWallet(adminWallet2, {from: owner});
        });

        it('Should withdraw to the new admin wallet', async () => {
            await this.farm.withdraw(0, toWei('500'), {from: bob});

            const adminWallet2Balancec = await this.erc20.balanceOf(adminWallet2);
            assert.equal(toWei("85.65"), adminWallet2Balancec);
        });
    });
});