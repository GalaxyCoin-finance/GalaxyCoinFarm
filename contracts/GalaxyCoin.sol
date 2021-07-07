// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./GalaxyStorage.sol";
import "./GalaxyEvents.sol";

contract GalaxyCoin is Initializable, ERC20Upgradeable, GalaxyStorage, GalaxyEvents {
    using SafeMath for uint256;

    /**
     * Modifier for only owner
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

    /**
     * Function to initialize contract after deployment
     */
    function initialize(address _adminOne, address _adminTwo, address _liquidityAddress) public virtual initializer {
        require(_adminOne != address(0), "Zero Address");
        require(_adminTwo != address(0), "Zero Address");
        require(_liquidityAddress != address(0), "Zero Address");

        __ERC20_init("Galaxy Coin", "GLXY");
        uint256 _initialSupply = 5000000;
        uint256 _decimalFactor = 10 ** uint256(decimals());
        _mint(_msgSender(), _initialSupply.mul(_decimalFactor));
        owner = msg.sender;
        adminOne = _adminOne;
        adminTwo = _adminTwo;
        liquidityAddress = _liquidityAddress;
    }

    /**
     * Function overiding ERC-20 transferFrom function to collect taxes and 
     * burn tokens
     */
    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        uint256 currentAllowance = allowance(sender, _msgSender());
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        
        if (whitelistAddress[msg.sender] == false) {
            uint256 remainingTokens = _collectTaxes(sender, amount);
            _transfer(sender, recipient, remainingTokens);
        } else {
            _transfer(sender, recipient, amount);
        }   

        _approve(sender, _msgSender(), currentAllowance.sub(amount));

        return true;
    }
    
    /**
     * Function to mint tokens with mint permission
     */
    function mint(address _to, uint256 _amount) public virtual {
        require(mintPermit[msg.sender] == true, "No Mint Permission");
        _mint(_to, _amount);

        emit Mint(msg.sender, _to, _amount);
    }

    /**
     * Function to burn tokens with burn permission
     */
    function burn(address _from, uint256 _amount) public virtual {
        require(burnPermit[msg.sender] == true, "No Burn Permission");
        _burn(_from, _amount);

        emit Burn(msg.sender, _from, _amount);
    }

    /**
     * Function to update liquidity address 
     */
    function UpdateLiquidityAddress(address _liquidityAddress) external virtual onlyOwner {
        require(_liquidityAddress != address(0), "Zero Address");
        liquidityAddress = _liquidityAddress;
    }
    
    /**
     * Function to whitelist address from tax
     */
    function setWhitelistAddress(address _addr, bool _permit) external virtual onlyOwner {
        require(_addr != address(0), "Zero Address");
        whitelistAddress[_addr] = _permit;
    }

    /**
     * Function to set mint permit
     */
    function setMintPermit(address _addr, bool _permit) external virtual onlyOwner {
        require(_addr != address(0), "Zero Address");
        mintPermit[_addr] = _permit;
    }

    /**
     * Function to set burn permit
     */
    function setBurnPermit(address _addr, bool _permit) external virtual onlyOwner {
        require(_addr != address(0), "Zero Address");
        burnPermit[_addr] = _permit;
    }

    /**
     * Function to calculate percentage
     */
    function percent(uint256 _amount, uint256 _fraction) public virtual pure returns(uint256) {
        return ((_amount).mul(_fraction)).div(10000);
    }

    /**
     * Function to collect taxes 
     * Returns tokens left after tax deduction
     */
    function _collectTaxes(address _sender, uint256 _amount) internal returns(uint256) {
        uint256 tokensToAdmin = percent(_amount, adminFeePercent);
        uint256 tokensToLiquidity = percent(_amount, liquidityFeePercent);
        uint256 tokensToBurn = percent(_amount, burnPercent);
        uint256 tokensToTransfer = _amount.sub(tokensToAdmin).sub(tokensToAdmin).sub(tokensToLiquidity)
                    .sub(tokensToBurn);

        _transfer(_sender, adminOne, tokensToAdmin);
        _transfer(_sender, adminTwo, tokensToAdmin);
        _transfer(_sender, liquidityAddress, tokensToLiquidity);
        _burn(_sender, tokensToBurn);

        return tokensToTransfer;
    }
}