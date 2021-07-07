pragma solidity ^0.8.0;

// SPDX-License-Identifier: MIT

contract GalaxyEvents {
    event Mint(address indexed caller, address indexed to, uint256 amount);
    event Burn(address indexed caller, address indexed from, uint256 amount);
}