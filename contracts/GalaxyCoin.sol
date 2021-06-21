pragma solidity ^0.8.0;

//SPDX-License-Identifier: MIT

/***
----------------------------------------------------
 Token Name: GALAXY COIN GLXY
----------------------------------------------------
Initial distribution phase:
Total Supply : 55,000,000 GLXY
Liquidity mining : 20,000,000 GLXY 
Liquidity : 20,000,000 GLXY/BNB
----------------------------------------------------
36.5% GLXY → IDO
36.5% GLXY → Initial Liquidity for PancakeSwap
9.5% GLXY → Exchange Market Maker Tokens
9.5% GLXY → Cefi Exchange
6% GLXY → Team Tokens (Locked for 3 months)
2% GLXY - Advertising / marketing 
----------------------------------------------------
Taxes :
2% Admin
5% will be added to liquidity pool
----------------------------------------------------
*/

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract GALAXYCOIN is IERC20, Ownable {
    using SafeMath for uint256;
      
    string  private _name;
    string  private _symbol;
    
    uint256 private _totalSupply;
    uint256 private _decimals = 18; // number count after decimal point
    uint256 private constant _MAX = ~uint256(0);
    uint256 private _DECIMALFACTOR = 10 ** uint256(_decimals);

    // Addresses   
    uint256 public adminFeePercent;
    uint256 public liquidityFeePercent;

    address private _adminOneTokenHolder; // First admin token holder address
    address private _adminTwoTokenHolder; // Second admin token holder address
    address private _liquidityTransfer; // Liquidity transfer address
    address private _whitelistAddress;  // address of presale address

    mapping (address => uint256) public _balances;
    mapping (address => mapping (address => uint256)) private _allowances;


    constructor (address _admin1TokensHolder, address _admin2TokensHolder, address _liquiditytransfer, uint256 _adminFeePercent, uint256 _liquidityFeePercent)  {
        _name = 'Galaxy Coin';
        _symbol = 'GLXY';
        _totalSupply =  55000000  * _DECIMALFACTOR;
        
        // Initialize token holder addresses
        _adminOneTokenHolder = _admin1TokensHolder;
        _adminTwoTokenHolder = _admin2TokensHolder;
        _liquidityTransfer = _liquiditytransfer;
        
        // Define admin and liquidity fee in percent
        adminFeePercent = _adminFeePercent; // convert into admin fee percent 
        liquidityFeePercent = _liquidityFeePercent;
        
        //transfer total supply to owner
        _balances[_msgSender()] = _totalSupply;

        emit Transfer(address(this), _msgSender(),  _totalSupply);
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }
    
     function decimals() public view returns (uint256) {
        return _decimals;
    }

    function totalSupply() public view override returns (uint256) { 
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }
    
    function find1Percent(uint256 value, uint256 percent) public pure returns (uint256)  {
        uint256 onePercent = value.mul(percent).div(10000);
        return onePercent;
    }
    
    function transfer(address recipient, uint256 amount) public  override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }
   
    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }
 
    function approve(address spender, uint256 amount) public  virtual override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        require(_allowances[sender][msg.sender] >= amount, "ERC20: Insufficient allowance");
        
        if (msg.sender != _whitelistAddress) {
            uint256 tokensToAdmin = find1Percent(amount, adminFeePercent);
            uint256 tokensToLiquidity = find1Percent(amount, liquidityFeePercent);
            uint256 tokensToTransfer = amount.sub(tokensToAdmin).sub(tokensToAdmin).sub(tokensToLiquidity);

            _transfer(sender, _adminOneTokenHolder, tokensToAdmin);
            _transfer(sender, _adminTwoTokenHolder, tokensToAdmin);
            _transfer(sender, _liquidityTransfer, tokensToLiquidity);

            _transfer(sender, recipient, tokensToTransfer);
        }
        else {
            _transfer(sender, recipient, amount);
        }
        _allowances[sender][msg.sender] = _allowances[sender][msg.sender].sub(amount);
        
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");
        require(sender != recipient,"ERC20: cannot send money to yourself");
        require(_balances[sender]>=amount,"ERC20: Insufficient Funds");
        
        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
        
        _balances[sender] = senderBalance - amount;
        _balances[recipient] += amount;
        
        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        require(owner != spender, "ERC20: cannot send allowances to yourself");
        require(_balances[owner] >= amount, "ERC20: Insufficient Funds");
    
        _allowances[owner][spender] = amount;

        emit Approval(owner, spender, amount);
    }
    
    // modifiers
    modifier onlyAdmin() {
        require(msg.sender == _adminOneTokenHolder, "ERC20: Only admin is allowed");
        _;
    }

    // function to update LiquidityTransfer
    function UpdateLiquidityTransfer(address liquidityTransfer) external onlyAdmin {
        _liquidityTransfer = liquidityTransfer;
    }
    
    // function to set whitelistAddress
    function UpdateWhitelistAddress(address whitelistAddress) external onlyAdmin {
        _whitelistAddress = whitelistAddress;
    }

    receive()
        payable
        external {
    }   
}