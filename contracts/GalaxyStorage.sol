pragma solidity ^0.8.0;

// SPDX-License-Identifier: MIT

contract GalaxyStorage {
    uint256 public constant adminFeePercent = 50;
    uint256 public constant liquidityFeePercent = 400;
    uint256 public constant burnPercent = 200;

    address public owner;
    address public adminOne; 
    address public adminTwo; 
    address public liquidityAddress; 
    address public BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    mapping (address => bool) public whitelistAddress;
    mapping (address => bool) public mintPermit;
    mapping (address => bool) public burnPermit;
}