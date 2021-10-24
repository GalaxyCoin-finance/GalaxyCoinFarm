pragma solidity ^0.8.0;

// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IGalaxy {
    function adminFeePercent() external view returns (uint256);
    function liquidityFeePercent() external view returns (uint256);
    function burnPercent() external view returns (uint256);
}


contract GalaxyLottery is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    
    address public admin;
    address public tokenContract;
    
    uint256 public ticketPrice;
    uint256 public adminFee;  // multiply with 100 (5% = 500)
    uint256 public firstWinnerShare;
    uint256 public secondWinnerShare;
    uint256 public thirdWinnerShare;
    uint256 public lastCreatedLotteryId;
    uint256 public usersPerLottery;
    uint256 public startBlock;
    uint256 private adminDeduction;
    uint256 private liquidityDeduction;
    uint256 private burnDuduction;
    uint256 private TaxDeductedAmount;
    
    uint256 nonce;
    uint256 oracle;
    
    Lottery[] public lotteryList;
    
    mapping (uint256 => address[]) private lotteryUsers;
    mapping (uint256 => uint256) public lotteryBalance;
    mapping (address => mapping (uint256 => uint256[])) public txIds;
    
    struct Lottery{
        uint256 lotteryId;
        uint256 createdAt;
        address winner1;
        address winner2;
        address winner3;
    }
    
    
    // events
    event CreateLotteryEvent(uint256 indexed _lotteryId,  uint256 _timestamp);
    event JoinLotteryEvent(uint256 indexed _lotteryId, address indexed _user, uint256 indexed _txId, 
                        uint256 _timestamp);
    event WinnerEvent(uint256 indexed _lotteryId, address indexed _winner, uint256 _winnerPosition, uint256 _winAmount, 
                        uint256 _timestamp);
    
    constructor(
        address _tokenContract, 
        uint256 _ticketPrice, 
        uint256 _adminFee, 
        uint256 _firstWinnerShare, 
        uint256 _secondWinnerShare, 
        uint256 _thirdWinnerShare,
        uint256 _usersPerLottery
        ) {
        require(_firstWinnerShare.add(_secondWinnerShare).add(_thirdWinnerShare).add(_adminFee) == 10000, 
            "Total Distribution Percentage should be 100");
        admin = msg.sender;  
        tokenContract = _tokenContract;
        ticketPrice = _ticketPrice;
        adminFee = _adminFee;
        firstWinnerShare = _firstWinnerShare;
        secondWinnerShare= _secondWinnerShare;
        thirdWinnerShare = _thirdWinnerShare;
        usersPerLottery = _usersPerLottery;
        startBlock = block.number;
        lotteryList.push(Lottery(0, 0, address(0x0), address(0x0), address(0x0)));
        _createLottery();
        updateTicketFee(ticketPrice);
    }
    
    /**
     * Function to update ticket fee
     */
    function updateTicketFee(uint256 _ticketPrice) public onlyOwner {
        ticketPrice = _ticketPrice;

        adminDeduction = _percent(ticketPrice, IGalaxy(tokenContract).adminFeePercent());
        liquidityDeduction = _percent(ticketPrice, IGalaxy(tokenContract).liquidityFeePercent());
        burnDuduction = _percent(ticketPrice, IGalaxy(tokenContract).burnPercent());
        TaxDeductedAmount = ticketPrice.sub(adminDeduction).sub(adminDeduction).sub(liquidityDeduction)
            .sub(burnDuduction);
    }
    
    /**
     * Function to update winner and admin distribution
     */
    function updateDistributionPercentage(uint256 _firstWinnerShare, uint256 _secondWinnerShare, 
    uint256 _thirdWinnerShare, uint256 _adminFee) external onlyOwner {
        require(_firstWinnerShare.add(_secondWinnerShare).add(_thirdWinnerShare).add(_adminFee) == 10000, 
            "Total Distribution Percentage should be 100");
        adminFee = _adminFee;
        firstWinnerShare = _firstWinnerShare;
        secondWinnerShare= _secondWinnerShare;
        thirdWinnerShare = _thirdWinnerShare;
    }
    
    /**
     * Function to create new lottery
     */
    function _createLottery() internal {
        lastCreatedLotteryId = lotteryList.length;

        delete lotteryUsers[lastCreatedLotteryId];
        
        lotteryList.push(Lottery(lastCreatedLotteryId, block.timestamp, address(0x0), address(0x0), address(0x0)));

        emit CreateLotteryEvent(lastCreatedLotteryId, block.timestamp);
    }
    
    /**
     * Function to join lottery
     */
    function joinLottery(uint256 _numOfTickets) external {
        IERC20(tokenContract).safeTransferFrom(msg.sender, address(this), _numOfTickets.mul(ticketPrice));
        
        uint256 _txId = _randTxId();

        for (uint256 i=0; i < _numOfTickets; i++) {
            lotteryUsers[lastCreatedLotteryId].push(msg.sender);
            
            lotteryBalance[lastCreatedLotteryId] = lotteryBalance[lastCreatedLotteryId].add(TaxDeductedAmount);

            emit JoinLotteryEvent(lastCreatedLotteryId, msg.sender, _txId, block.timestamp);

            if (checkJoinedNumber() >= usersPerLottery) {
                distributeRewards(lastCreatedLotteryId);
            } 
        }
        txIds[msg.sender][lastCreatedLotteryId].push(_txId); 
    }

    /**
     * Function to get tickets of an address in current lottery
     */
    function getTicketCount(address _user) public view returns(uint256) {
        uint256 _count = 0;
        for (uint256 i=0; i < lotteryUsers[lastCreatedLotteryId].length; i++) {
            if (lotteryUsers[lastCreatedLotteryId][i] == _user) {
                _count = _count.add(1);
            }
        }
        return _count;
    }

    /**
     * Function to get txId length of an address
     */
    function getTxLength(address _user) public view returns(uint256) {
        return txIds[_user][lastCreatedLotteryId].length;
    }
    
    /**
     * Function to check users joined in a current lottery
     */
    function checkJoinedNumber() public view returns(uint256) {
        return lotteryUsers[lastCreatedLotteryId].length;
    }
    
    /**
     * Function to distribute rewards
     */
    function distributeRewards(uint256 _lotteryId) internal {
        require(lotteryUsers[_lotteryId].length >= 3, "Atleast 3 Users Required");
        
        _getWinners(lotteryUsers[_lotteryId].length, _lotteryId);
        
        require(lotteryList[_lotteryId].winner1 != address(0x0), "winner1 address zero is invalid");
        require(lotteryList[_lotteryId].winner2 != address(0x0), "winner2 address zero is invalid");
        require(lotteryList[_lotteryId].winner3 != address(0x0), "winner3 address zero is invalid");
        
        uint256 totalLotteryAmount = lotteryBalance[_lotteryId];
        require(IERC20(tokenContract).balanceOf(address(this)) >= totalLotteryAmount, 
            "Contract doesn't have enough balance");

        uint256 firstWinnersAmount = _percent(totalLotteryAmount, firstWinnerShare);
        uint256 secondWinnersAmount = _percent(totalLotteryAmount, secondWinnerShare);
        uint256 thridWinnersAmount = _percent(totalLotteryAmount, thirdWinnerShare);
        
        IERC20(tokenContract).safeTransfer(lotteryList[_lotteryId].winner1, firstWinnersAmount);
        IERC20(tokenContract).safeTransfer(lotteryList[_lotteryId].winner2, secondWinnersAmount);
        IERC20(tokenContract).safeTransfer(lotteryList[_lotteryId].winner3, thridWinnersAmount);
        IERC20(tokenContract).safeTransfer(admin, totalLotteryAmount.sub(firstWinnersAmount).sub(secondWinnersAmount)
            .sub(thridWinnersAmount));
        
        emit WinnerEvent(_lotteryId, lotteryList[_lotteryId].winner1, 1, firstWinnersAmount, block.timestamp);
        emit WinnerEvent(_lotteryId, lotteryList[_lotteryId].winner2, 2, secondWinnersAmount, block.timestamp);
        emit WinnerEvent(_lotteryId, lotteryList[_lotteryId].winner3, 3, thridWinnersAmount, block.timestamp);
        
        delete lotteryList[_lotteryId];
        delete lotteryUsers[_lotteryId];

        _createLottery();
    }
    
    /**
     * Function to get winners of a lottery
     */
    function _getWinners(uint256 _mod, uint256 _lotteryId) internal {
        uint256 rand1 = _randModulus(_mod);
        uint256 rand2 = _randModulus(_mod);
        uint256 rand3 = _randModulus(_mod);
        
        while(rand2 == rand1) {
            rand2 = _randModulus(_mod);
        }
        while(rand3 == rand1 || rand3 == rand2) {
            rand3 = _randModulus(_mod);
        }
        
        uint256 createdAt = lotteryList[_lotteryId].createdAt;
        address winner1 = lotteryUsers[_lotteryId][rand1];
        address winner2 = lotteryUsers[_lotteryId][rand2];
        address winner3 = lotteryUsers[_lotteryId][rand3];
        
        lotteryList[_lotteryId] = Lottery(_lotteryId, createdAt, winner1, winner2, winner3);
    }
    
    /**
     * helper function to generate random number
     ** Need to update with VRF here
     */
    function _randModulus(uint256 _mod) internal returns(uint256) {
        uint256 rand = uint256(keccak256(abi.encodePacked(nonce, oracle, block.timestamp, block.difficulty, 
                                msg.sender))) % _mod;
        nonce++;
        return rand;
    }

    /**
     * helper function to generate random tx id
     */
    function _randTxId() internal returns(uint256) {
        uint256 rand = uint256(keccak256(abi.encodePacked(nonce, oracle, block.timestamp, block.difficulty, 
                                msg.sender))) % 9999999999999999;
        nonce++;
        return rand;
    }
    
    /**
     * helper function to calculate percentage
     */
    function _percent(uint256 _amount, uint256 _fraction) internal pure returns(uint256) {
        return ((_amount).mul(_fraction)).div(10000);
    }

    /**
     * Function to set oracle 
     */
    function setOracle(uint256 _oracle) external onlyOwner {
        oracle = _oracle;
    }

    /**
     * Function to withdraw BNB 
     */
    function withdrawAmount(address _to, uint256 _amount) external onlyOwner nonReentrant {
        require(_to != address(0), "_to is Zero Address");
        uint256 balance = address(this).balance;
        require(balance >= _amount, "Insufficient balance");
        
        payable(_to).transfer(balance);
    }

    /**
     * Function to withdraw GLXY tokens 
     */ 
    function withdrawTokens(address _to, uint256 _amount) external onlyOwner nonReentrant {
        require(_to != address(0), "_to is Zero Address");
        uint256 balance = IERC20(tokenContract).balanceOf(address(this));
        require(balance >= _amount, "Insufficient balance");
        
        IERC20(tokenContract).safeTransfer(_to, _amount);
    }
}