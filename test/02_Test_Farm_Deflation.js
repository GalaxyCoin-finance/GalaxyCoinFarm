const Farm = artifacts.require('./Farm.sol');
const ERC20 = artifacts.require('./test/ERC20Mock.sol');
const LP = artifacts.require('./test/DeflationERC20Mock.sol');
const {waitUntilBlock} = require('./helpers/tempo')(web3);
const truffleAssert = require('truffle-assertions');
const afterTax = 0.99;
contract('Farm with Deflation tokens', ([owner, alice, bob, carl]) => {
    before(async () => {
        this.erc20 = await ERC20.new("Mock token", "MOCK", 1000000);
        let balance = await this.erc20.balanceOf(owner);
        assert.equal(balance.valueOf(), 1000000);

        this.lp = await LP.new("LP Token", "LP");
        this.lp2 = await LP.new("LP Token 2", "LP2");

        const currentBlock = await web3.eth.getBlockNumber();
        this.startBlock = currentBlock + 100;

        this.farm = await Farm.new(this.erc20.address, 100, this.startBlock, owner);
        this.farm.add(15, this.lp.address, 0, 0);

        await this.erc20.approve(this.farm.address, 10000);
        await this.farm.fund(10000);
    });

    before(async () => {
        await Promise.all([
            this.lp.mint(alice, 5000),
            this.lp.mint(bob, 500),
            this.lp.mint(carl, 2000),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp.balanceOf(alice),
            this.lp.balanceOf(bob),
            this.lp.balanceOf(carl),
        ]);

        assert.equal(5000, balanceAlice);
        assert.equal(500, balanceBob);
        assert.equal(2000, balanceCarl);
    });

    before(async () => {
        await Promise.all([
            this.lp2.mint(alice, 1000),
            this.lp2.mint(carl, 800),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp2.balanceOf(alice),
            this.lp2.balanceOf(bob),
            this.lp2.balanceOf(carl),
        ]);

        assert.equal(1000, balanceAlice);
        assert.equal(0, balanceBob);
        assert.equal(800, balanceCarl);
    });

    describe('when created', () => {
        it('is linked to the Mock ERC20 token', async () => {
            const linked = await this.farm.erc20();
            assert.equal(linked, this.erc20.address);
        });

        it('is configured to reward 100 MOCK per block', async () => {
            const rewardPerBlock = await this.farm.rewardPerBlock();
            assert.equal(rewardPerBlock, 100);
        });

        it('is configured with the correct start block', async () => {
            const startBlock = await this.farm.startBlock();
            assert.equal(startBlock, this.startBlock);
        });

        it('is initialized for the LP token', async () => {
            const poolLength = await this.farm.poolLength();
            assert.equal(1, poolLength);

            const poolInfo = await this.farm.poolInfo(0);
            assert.equal(poolInfo[0], this.lp.address);
            assert.equal(poolInfo[1].words[0], 15);

            const totalAllocPoint = await this.farm.totalAllocPoint();
            assert.equal(totalAllocPoint, 15);
        });

        it('holds 10,000 MOCK', async () => {
            const balance = await this.erc20.balanceOf(this.farm.address);
            assert.equal(balance, 10000)
        });

        it('will run for 100 blocks', async () => {
            const endBlock = await this.farm.endBlock();
            assert.equal(100, endBlock - this.startBlock);
        });
    });

    describe('before the start block', () => {
        before(async () => {
            await Promise.all([
                this.lp.approve(this.farm.address, 1500, {from: alice}),
                this.lp.approve(this.farm.address, 500, {from: bob})
            ]);

            await Promise.all([
                this.farm.deposit(0, 1500, {from: alice}),
                this.farm.deposit(0, 500, {from: bob})
            ]);
        });

        it('allows participants to join', async () => {
            const balanceFarm = await this.lp.balanceOf(this.farm.address);
            assert.equal(2000 * afterTax, balanceFarm);

            const amountStaked = (await this.farm.poolInfo(0)).stakedAmount;
            assert.equal(2000 * afterTax, amountStaked);

            const balanceAlice = await this.lp.balanceOf(alice);
            const depositAlice = await this.farm.deposited(0, alice);
            assert.equal(3500, balanceAlice);
            assert.equal(1500 * afterTax, depositAlice);

            const balanceBob = await this.lp.balanceOf(bob);
            const depositBob = await this.farm.deposited(0, bob);
            assert.equal(0, balanceBob);
            assert.equal(500 * afterTax, depositBob);
        });

        it('does not assign any rewards yet', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(0, totalPending);
        });
    })

    describe('after 10 blocks of farming', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 10);
        });

        it('has a total reward of 1000 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(1000, totalPending);
        });

        it('reserved 749 for alice and 249 for bob', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(749, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(249, pendingBob);
        });
    });

    describe('with a 3th participant after 30 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 28);

            await this.lp.approve(this.farm.address, 2000, {from: carl});
            await this.farm.deposit(0, 2000, {from: carl});
        });

        it('has a total reward of 3000 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(3000, totalPending);
        });

        it('reserved 2249 for alice, 751 for bob, and nothing for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(2249, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(749, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(0, pendingCarl);
        });
    });

    describe('after 50 blocks of farming', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 50);
        });

        it('has a total reward of 5000 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(5000, totalPending);
        });

        it('reserved 2999 for alice, 999 for bob, and 999 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(2999, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(999, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(1000, pendingCarl);
        });
    });

    describe('with a participant withdrawing after 70 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 69);
            await this.farm.withdraw(0, 1500 * afterTax, {from: alice});
        });

        it('gives alice 3749 MOCK and 1500 LP', async () => {
            const balanceERC20 = await this.erc20.balanceOf(alice);
            assert.equal(3749, balanceERC20);

            const balanceLP = await this.lp.balanceOf(alice);
            assert.equal(4971, balanceLP);
        });

        it('has no deposit for alice', async () => {
            const deposited = await this.farm.deposited(0, alice);
            assert.equal(0, deposited);
        });

        it('has a total reward of 3250 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(3251, totalPending);
        });

        it('reserved nothing for alice, 1249 for bob, and 2000 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(1249, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(2000, pendingCarl);
        });
    });

    describe('with a participant partially withdrawing after 80 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 79);
            await this.farm.withdraw(0, 1500, {from: carl});
        });

        it('gives carl 2800 MOCK and 1485 LP', async () => {
            const balanceERC20 = await this.erc20.balanceOf(carl);
            assert.equal(2800, balanceERC20);

            const balanceLP = await this.lp.balanceOf(carl);
            assert.equal(1485, balanceLP);
        });

        it('has a 480 LP deposit for carl', async () => {
            const deposited = await this.farm.deposited(0, carl);
            assert.equal(480, deposited);
        });

        it('has a total reward of 1451 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(1451, totalPending);
        });

        it('reserved nothing for alice, 1449 for bob, and nothing for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(1449, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(0, pendingCarl);
        });
    });

    describe('is safe', () => {
        it('won\'t allow alice to withdraw', async () => {
            await truffleAssert.reverts(
                this.farm.withdraw(0, 10, {from: alice}),
                "withdraw: can't withdraw more than deposit"
            );
        });

        it('won\'t allow carl to withdraw more than his deposit', async () => {
            const deposited = await this.farm.deposited(0, carl);
            assert.equal(480, deposited);

            await truffleAssert.reverts(
                this.farm.withdraw(0, 600, {from: carl}),
                "withdraw: can't withdraw more than deposit"
            );
        });
    });

    describe('when it receives more funds (8000 MOCK)', () => {
        before(async () => {
            await this.erc20.approve(this.farm.address, 8000);
            await this.farm.fund(8000);
        });

        it('runs for 180 blocks (80 more)', async () => {
            const endBlock = await this.farm.endBlock();
            assert.equal(180, endBlock - this.startBlock);
        });
    });

    describe('with an added lp token (for 25%) after 100 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 99);
            this.farm.add(5, this.lp2.address, 0, 0);
        });

        it('has a total reward of 3451 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(3451, totalPending);
        });

        it('is initialized for the LP token 2', async () => {
            const poolLength = await this.farm.poolLength();
            assert.equal(2, poolLength);

            const poolInfo = await this.farm.poolInfo(1);
            assert.equal(poolInfo[0], this.lp2.address);
            assert.equal(poolInfo[1].words[0], 5);

            const totalAllocPoint = await this.farm.totalAllocPoint();
            assert.equal(totalAllocPoint, 20);
        });

        it('reserved nothing for alice, 2465 for bob, and 984 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(2465, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(984, pendingCarl);
        });
    });

    describe('with 1st participant for lp2 after 110 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 108);

            await this.lp2.approve(this.farm.address, 500, {from: carl});
            await this.farm.deposit(1, 500, {from: carl});
        });

        it('holds 975 LP for the participants', async () => {
            const balanceFarm = await this.lp.balanceOf(this.farm.address);
            assert.equal(975, balanceFarm);

            const depositAlice = await this.farm.deposited(0, alice);
            assert.equal(0, depositAlice);

            const depositBob = await this.farm.deposited(0, bob);
            assert.equal(495, depositBob);

            const depositCarl = await this.farm.deposited(0, carl);
            assert.equal(480, depositCarl);
        });

        it('holds 495 LP2 for the participants', async () => {
            const balanceFarm = await this.lp2.balanceOf(this.farm.address);
            assert.equal(495, balanceFarm);

            const depositAlice = await this.farm.deposited(1, alice);
            assert.equal(0, depositAlice);

            const depositBob = await this.farm.deposited(1, bob);
            assert.equal(0, depositBob);

            const depositCarl = await this.farm.deposited(1, carl);
            assert.equal(495, depositCarl);
        });

        it('has a total reward of 4451 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(4451, totalPending);
        });

        it('reserved 75% for LP (50/50 bob/carl)', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(2846, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(1353, pendingCarl);
        });

        it('reserved 25% for LP2 (not rewarded) -> 250 MOCK inaccessible', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(1, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(0, pendingCarl);
        });
    });

    describe('with 2nd participant for lp2 after 120 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 118);

            await this.lp2.approve(this.farm.address, 1000, {from: alice});
            await this.farm.deposit(1, 1000, {from: alice});
        });

        it('holds 1485 LP2 for the participants', async () => {
            const balanceFarm = await this.lp2.balanceOf(this.farm.address);
            assert.equal(1485, balanceFarm);

            const depositAlice = await this.farm.deposited(1, alice);
            assert.equal(1000 * afterTax, depositAlice);

            const depositBob = await this.farm.deposited(1, bob);
            assert.equal(0, depositBob);

            const depositCarl = await this.farm.deposited(1, carl);
            assert.equal(495, depositCarl);
        });

        it('has a total reward of 5450 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(5451, totalPending);
        });

        it('reserved 75% for LP with 3226 for bob and 1723 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(3226, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(1723, pendingCarl);
        });

        it('reserved 25% for LP2 with 250 for carl', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(1, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(249, pendingCarl);
        });
    });

    describe('after 140 blocks of farming', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 140);
        });

        it('has a total reward of 7451 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(7451, totalPending);
        });

        it('reserved 75% for LP with 3988 for bob and 2461 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(3988, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(2461, pendingCarl);
        });

        it('reserved 25% for LP2 with 333 for alice and 416 for carl', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(334, pendingAlice);

            const pendingBob = await this.farm.pending(1, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(416, pendingCarl);
        });
    });

    describe('with a participant partially withdrawing LP2 after 150 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 149);
            await this.farm.withdraw(1, 200, {from: carl});
        });

        it('gives carl 498 MOCK and 200 LP', async () => {
            const balanceERC20 = await this.erc20.balanceOf(carl);
            assert.equal(3299, balanceERC20);

            const balanceLP = await this.lp2.balanceOf(carl);
            assert.equal(498, balanceLP);
        });

        it('has a total reward of 7952 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(7952, totalPending);
        });

        it('reserved 75% for LP with 4369 for bob and 2830 for carl', async () => {
            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(4369, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(2830, pendingCarl);
        });

        it('reserved 25% for LP2 with 500 for alice and nothing for carl', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(500, pendingAlice);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(0, pendingCarl);
        });

        it('holds 975 LP for the participants', async () => {
            const balanceFarm = await this.lp.balanceOf(this.farm.address);
            assert.equal(975, balanceFarm);

            const depositBob = await this.farm.deposited(0, bob);
            assert.equal(495, depositBob);

            const depositCarl = await this.farm.deposited(0, carl);
            assert.equal(480, depositCarl);
        });

        it('holds 1285 LP2 for the participants', async () => {
            const balanceFarm = await this.lp2.balanceOf(this.farm.address);
            assert.equal(1285, balanceFarm);

            const depositAlice = await this.farm.deposited(1, alice);
            assert.equal(990, depositAlice);

            const depositCarl = await this.farm.deposited(1, carl);
            assert.equal(295, depositCarl);
        });
    });

    describe('with a participant doing an emergency withdraw LP2 after 160 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 159);
            await this.farm.emergencyWithdraw(1, {from: carl});
        });

        it('gives carl 491 LP', async () => {
            const balanceLP = await this.lp2.balanceOf(carl);
            assert.equal(791, balanceLP);
        });

        it('gives carl no MOCK', async () => {
            const balanceERC20 = await this.erc20.balanceOf(carl);
            assert.equal(3299, balanceERC20);
        });

        it('holds no LP2 for carl', async () => {
            const depositCarl = await this.farm.deposited(1, carl);
            assert.equal(0, depositCarl);
        });

        it('has no reward for carl', async () => {
            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(0, pendingCarl);
        });

        it('holds 990 LP2 for alice', async () => {
            const balanceFarm = await this.lp2.balanceOf(this.farm.address);
            assert.equal(990, balanceFarm);

            const depositAlice = await this.farm.deposited(1, alice);
            assert.equal(990, depositAlice);
        });

        it('has 750 MOCK pending for alice (receives bobs share)', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(750, pendingAlice);
        });
    });

    describe('when closed after 180 blocks', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 180);
        });

        it('has a total reward of 10952 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(10952, totalPending);
        });

        it('reserved 75% for LP with 4325 for bob and 2875 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(5511, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(3938, pendingCarl);
        });

        it('reserved 25% for LP2 with 1250 for alice', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(1250, pendingAlice);

            const pendingBob = await this.farm.pending(1, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(0, pendingCarl);
        });
    });

    describe('when closed for 20 blocks (after 200 blocks)', () => {
        before(async () => {
            await waitUntilBlock(10, this.startBlock + 200);
        });

        it('still has a total reward of 10952 MOCK pending', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(10952, totalPending);
        });

        it('has a pending reward for LP 5511 for bob and 3938 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(5511, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(3938, pendingCarl);
        });

        it('has a pending reward for LP2 with 1250 for alice', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(1250, pendingAlice);

            const pendingBob = await this.farm.pending(1, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(0, pendingCarl);
        });

        it('will not accept new funds', async () => {
            await truffleAssert.reverts(
                this.farm.fund(10000),
                "fund: too late, the farm is closed"
            );
        });
    });

    describe('with participants withdrawing after closed', async () => {
        before(async () => {
            await this.farm.withdraw(1, await this.farm.deposited(1, alice), {from: alice});
            await this.farm.withdraw(0, await this.farm.deposited(0, bob), {from: bob});
            await this.farm.withdraw(0, await this.farm.deposited(0, carl), {from: carl});
        });

        it('gives alice 1250 MOCK and 981 LP2', async () => {
            const balanceERC20 = await this.erc20.balanceOf(alice);
            assert.equal(4999, balanceERC20);

            const balanceLP = await this.lp.balanceOf(alice);
            assert.equal(4971, balanceLP);

            const balanceLP2 = await this.lp2.balanceOf(alice);
            assert.equal(981, balanceLP2);
        });

        it('gives carl 5511 MOCK and 491 LP', async () => {
            const balanceERC20 = await this.erc20.balanceOf(bob);
            assert.equal(5511, balanceERC20);

            const balanceLP = await this.lp.balanceOf(bob);
            assert.equal(491, balanceLP);
        });

        it('gives carl 4000 MOCK and 500 LP', async () => {
            const balanceERC20 = await this.erc20.balanceOf(carl);
            assert.equal(7237, balanceERC20);

            const balanceLP = await this.lp.balanceOf(carl);
            assert.equal(1961, balanceLP);

            const balanceLP2 = await this.lp2.balanceOf(carl);
            assert.equal(791, balanceLP2);
        });

        it('has an end balance of 250 MOCK, which is lost forever', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(253, totalPending);

            const balanceFarm = await this.erc20.balanceOf(this.farm.address);
            assert.equal(253, balanceFarm);
        });

        it('has no pending reward for LP', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(0, pendingCarl);
        });

        it('has no pending reward for LP2', async () => {
            const pendingAlice = await this.farm.pending(1, alice);
            assert.equal(0, pendingAlice);

            const pendingBob = await this.farm.pending(1, bob);
            assert.equal(0, pendingBob);

            const pendingCarl = await this.farm.pending(1, carl);
            assert.equal(0, pendingCarl);
        });
    });
});