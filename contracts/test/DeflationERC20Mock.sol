// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract DeflationERC20Mock is ERC20 {

    using SafeMath for uint256;

    uint256 public tax = 100; // 1%

    constructor (
        string memory name,
        string memory symbol
    ) payable ERC20(name, symbol) {}

    function transferInternal(address from, address to, uint256 value) public {

        _transfer(from, to, value - _tax(from, value));
    }

    function approveInternal(address owner, address spender, uint256 value) public {
        _approve(owner, spender, value);
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount - _tax(_msgSender(), amount));
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount - _tax(sender, amount));

        uint256 currentAllowance = allowance(sender, _msgSender());
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, _msgSender(), currentAllowance - amount);
        }

        return true;
    }

    function _tax(address sender, uint256 _amount) internal returns (uint256 taxAmount){
        taxAmount = percent(_amount, tax);
        _burn(sender, taxAmount);
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    /* 
    Function to calculate percentage
     */
    function percent(uint256 _amount, uint256 _fraction) public virtual pure returns(uint256) {
        return ((_amount).mul(_fraction)).div(10000);
    }
} 
