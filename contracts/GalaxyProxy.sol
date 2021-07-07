pragma solidity ^0.8.0;

// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract GalaxyProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _admin) 
    TransparentUpgradeableProxy(_logic, _admin, "") {}

    function getCurrentImplementation() public view returns(address) {
        return _implementation();
    }
}