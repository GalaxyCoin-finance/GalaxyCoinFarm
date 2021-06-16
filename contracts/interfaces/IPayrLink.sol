// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPayrLink {
    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many PAYR the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 poolToken;               // Address of ERC20 token contract. ETH is 0x0
        address factory;                // Address of Factory
        uint256 totalReward;            // Total reward of the pool
        uint256 accERC20PerShare;       // Accumulated ERC20s per share, times 1e36.
        uint256 totalDeposited;         // Total deposited PAYR to the pool
    }

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    function poolLength() external view returns (uint256);
    function addReward (uint256 _pid, uint256 _amount) external;
    function deposited(uint256 _pid, address _user) external view returns (uint256);
    function pending(uint256 _pid, address _user) external view returns (uint256);
    function massUpdatePools() external;
    function deposit(uint256 _pid, uint256 _amount) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function emergencyWithdraw(uint256 _pid) external;

}
