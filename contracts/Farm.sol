// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// Farm distributes the ERC20 rewards based on staked LP to each user.
//
// Cloned from https://github.com/SashimiProject/sashimiswap/blob/master/contracts/MasterChef.sol
// Last Edited by GalaxyCoin.finance team adding lots of features to meet their use case


contract Farm is Ownable, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of ERC20s
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accERC20PerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accERC20PerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;             // Address of LP token contract.
        uint256 allocPoint;         // How many allocation points assigned to this pool. ERC20s to distribute per block.
        uint256 lastRewardBlock;    // Last block number that ERC20s distribution occurs.
        uint256 accERC20PerShare;   // Accumulated ERC20s per share, times 1e36.
        uint256 withdrawFee;        // Fee of amount which will go to admin's wallet when people unstake
        uint256 claimFee;           // Fee of amount which will go to admin's wallet when people claim
        uint256 stakedAmount;       // Amount of @lpToken staked in this pool
    }

    // Address of the ERC20 Token contract.
    IERC20 public erc20;
    // total amount of ERC20 rewards that this contract will distributed from start to endBlock
    uint256 public totalERC20Rewards;
    // The total amount of ERC20 that's paid out as reward.
    uint256 public paidOut = 0;
    // ERC20 tokens rewarded per block.
    uint256 public rewardPerBlock;

    // block where the last rewardPerBlock change
    uint256 public lastEmissionChange;
    // all pending rewards before from last block rewards change
    uint256 public rewardsAmountBeforeLastChange;


    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;

    // The block number when farming starts.
    uint256 public startBlock;
    // The block number when farming ends.
    uint256 public endBlock;

    //admin wallet's address
    address private adminWallet;

    // used to track if the farm is initialized 
    bool private init;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(IERC20 _erc20, uint256 _rewardPerBlock, uint256 _startBlock, address _adminWalletAddr) {
        erc20 = _erc20;
        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        lastEmissionChange = _startBlock;
        endBlock = _startBlock;
        adminWallet = _adminWalletAddr;

        init = _erc20 != IERC20(address(0)) &&
        endBlock != 0 && _startBlock != 0;
    }

    modifier onlyAfterInit(){
        require(init, "Farm: init the farm first");
        _;
    }

    // Number of LP pools
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function initializeFarm(
        IERC20 _erc20,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        address _adminWalletAddr
    ) external onlyOwner {
        require(!init, "initializeFarm: Already initialized");

        erc20 = _erc20;
        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        lastEmissionChange = _startBlock;
        endBlock = _startBlock;
        adminWallet = _adminWalletAddr;

        init = _erc20 != IERC20(address(0)) &&
        endBlock != 0 && _startBlock != 0;
    }

    /**
        Pauses the contract stoping deposits and widrawals 
     */
    function pause() external onlyOwner{
        _pause();
    }


    /**
        unpause the contracts
     */
    function unPause() external onlyOwner{
        _unpause();
    }


    // change adminWallet (the one that receives the fees)
    function changeAdminWallet(address _newAdminWallet) external onlyOwner {
        require(_newAdminWallet != address(0), "changeAdminWallet: can't be zero address");
        adminWallet = _newAdminWallet;
    }

    // Fund the farm, increase the end block
    function fund(uint256 _amount) external onlyOwner onlyAfterInit {
        require(block.number < endBlock, "fund: too late, the farm is closed");
        require(_amount.mod(rewardPerBlock) == 0, "fund: _amount not dividable by rewardPerBlock");
        // avoid precision loss

        erc20.transferFrom(address(msg.sender), address(this), _amount);
        endBlock += _amount.div(rewardPerBlock);
        totalERC20Rewards += _amount;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    function add(uint256 _allocPoint, IERC20 _lpToken, uint256 _withdrawFee, uint256 _claimFee) external onlyOwner onlyAfterInit {
        massUpdatePools();

        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
            totalAllocPoint = totalAllocPoint.add(_allocPoint);
            poolInfo.push(PoolInfo({
            lpToken : _lpToken,
            allocPoint : _allocPoint,
            lastRewardBlock : lastRewardBlock,
            accERC20PerShare : 0,
            withdrawFee : _withdrawFee,
            claimFee : _claimFee,
            stakedAmount : 0
        }));
    }

    // Update the given pool's ERC20 allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint) external onlyOwner onlyAfterInit {
        massUpdatePools();

        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // View function to see deposited LP for a user.
    function deposited(uint256 _pid, address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }

    // View function to see pending ERC20s for a user.
    function pending(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accERC20PerShare = pool.accERC20PerShare;
        uint256 lpSupply = pool.stakedAmount;

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 lastBlock = block.number < endBlock ? block.number : endBlock;
            uint256 nrOfBlocks = lastBlock.sub(pool.lastRewardBlock);
            uint256 erc20Reward = nrOfBlocks.mul(rewardPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accERC20PerShare = accERC20PerShare.add(erc20Reward.mul(1e36).div(lpSupply));
        }

        return user.amount.mul(accERC20PerShare).div(1e36).sub(user.rewardDebt);
    }

    // View function for total reward the farm has yet to pay out.
    function totalPending() external view returns (uint256) {
        if (block.number <= startBlock) {
            return 0;
        }
        return _totalPastRewards().sub(paidOut);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        uint256 lastBlock = block.number < endBlock ? block.number : endBlock;

        if (lastBlock <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.stakedAmount;
        if (lpSupply == 0) {
            pool.lastRewardBlock = lastBlock;
            return;
        }

        uint256 nrOfBlocks = lastBlock.sub(pool.lastRewardBlock);
        uint256 erc20Reward = nrOfBlocks.mul(rewardPerBlock).mul(pool.allocPoint).div(totalAllocPoint);

        pool.accERC20PerShare = pool.accERC20PerShare.add(erc20Reward.mul(1e36).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to Farm for ERC20 allocation.
    function deposit(uint256 _pid, uint256 _amount) external onlyAfterInit whenNotPaused{
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pendingAmount = user.amount.mul(pool.accERC20PerShare).div(1e36).sub(user.rewardDebt);
            uint256 adminWalletAmount = pendingAmount * pool.claimFee / 1000;
            if (adminWalletAmount > 0)
                erc20Transfer(adminWallet, adminWalletAmount, true);
            erc20Transfer(msg.sender, pendingAmount - adminWalletAmount, true);
        }
        uint256 balanceBefore = pool.lpToken.balanceOf(address(this));
        pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        uint256 netDeposit = pool.lpToken.balanceOf(address(this)).sub(balanceBefore);
        pool.stakedAmount += netDeposit;
        user.amount = user.amount.add(netDeposit);
        user.rewardDebt = user.amount.mul(pool.accERC20PerShare).div(1e36);
        emit Deposit(msg.sender, _pid, netDeposit);
    }

    // Withdraw LP tokens from Farm.
    function withdraw(uint256 _pid, uint256 _amount) external whenNotPaused {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        require(user.amount >= _amount, "withdraw: can't withdraw more than deposit");

        updatePool(_pid);

        uint256 pendingAmount = user.amount.mul(pool.accERC20PerShare).div(1e36).sub(user.rewardDebt);
        uint256 adminRewardAmount = pendingAmount.mul(pool.claimFee).div(1000);
        if (adminRewardAmount > 0)
            erc20Transfer(adminWallet, adminRewardAmount, true);
        erc20Transfer(msg.sender, pendingAmount - adminRewardAmount, true);

        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accERC20PerShare).div(1e36);
        uint256 adminWalletAmount = _amount * pool.withdrawFee / 1000;
        if (adminWalletAmount > 0)
            pool.lpToken.safeTransfer(adminWallet, adminWalletAmount);
        pool.lpToken.safeTransfer(address(msg.sender), _amount - adminWalletAmount);
        pool.stakedAmount -= _amount;
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) external whenPaused {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        pool.stakedAmount -= user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Transfer ERC20 and update the required ERC20 to payout all rewards
    function erc20Transfer(address _to, uint256 _amount, bool _isPayout) internal {
        erc20.transfer(_to, _amount);
        if (_isPayout)
            paidOut += _amount;
    }

    /* 
        recover any ERC20 tokens sent by mistake or recover rewards 
        after all farms have ended and all users have unstaked
        technically can be called while farming is still active
        owner can in no way take users staked token or rewards
    */
    function erc20Withdraw(IERC20 _erc20, address _to) onlyOwner external {
        // check if this _erc20 has pools and users are still staked in those pools
        uint256 userStakeLeft;
        for (uint256 i = 0; i < poolInfo.length; i++) {
            if (poolInfo[i].lpToken == _erc20)
                userStakeLeft += poolInfo[i].stakedAmount;
        }

        // since we can not track all users pending rewards 
        // the owner can only withdraw erc20 if all users have
        // withdrawn and claimed their rewards
        if (_erc20 == erc20) {
            require(block.number > endBlock, "Farming is not ended yet.");
            uint256 allStaked;
            for (uint256 i = 0; i < poolInfo.length; i++)
                allStaked += poolInfo[i].stakedAmount;
            require(allStaked == 0, "erc20Withdraw: can't widraw erc20 while there are stakers left");
        }

        // only transfer the amount not belonging to users
        uint256 amount = _erc20.balanceOf(address(this)) - userStakeLeft;
        if (amount > 0)
            _erc20.transfer(_to, amount);
    }


    function _totalPastRewards() internal view returns (uint256) {
        if (block.number < startBlock)
            return 0;

        uint256 lastBlock = block.number < endBlock ? block.number : endBlock;
        return rewardsAmountBeforeLastChange.add(rewardPerBlock.mul(lastBlock - lastEmissionChange));
    }

    // Change the rewardPerBlock
    function changeRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner onlyAfterInit {
        require(block.number < endBlock, "changeRewardPerBlock: Too late farming ended");
        uint256 totalRewardsTillNow = _totalPastRewards();
        uint256 leftRewards = totalERC20Rewards - totalRewardsTillNow;
        uint256 newLeftBlocks = leftRewards.div(_rewardPerBlock);
        uint256 leftoverRewards = leftRewards.mod(_rewardPerBlock);
        uint256 newEndBlock = block.number > startBlock ? block.number + newLeftBlocks : startBlock + newLeftBlocks;

        if (_rewardPerBlock > rewardPerBlock)
        // 21600 blocks should be roughly 24 hours
            require(newEndBlock > block.number + 21600, "Please fund the contract before increasing the rewards per block");

        massUpdatePools();

        // push this change into history
        if (block.number >= startBlock) {
            lastEmissionChange = block.number;
            rewardsAmountBeforeLastChange = totalRewardsTillNow;
        }

        endBlock = newEndBlock;
        rewardPerBlock = _rewardPerBlock;
        // send any excess rewards to admin (caused by rewards % rewardperblock != 0)
        if (leftoverRewards > 0) {
            // this is not a payout hence the 'false'
            erc20Transfer(adminWallet, leftoverRewards, false);
            totalERC20Rewards -= leftoverRewards;
        }
    }
}
