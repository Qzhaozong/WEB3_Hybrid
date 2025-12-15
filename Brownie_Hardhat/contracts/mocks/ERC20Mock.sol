// test/mocks/ERC20Mock.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract ERC20Mock {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(
        string memory _name,
        string memory _symbol,
        address initialAccount,
        uint256 initialBalance
    ) {
        name = _name;
        symbol = _symbol;
        _mint(initialAccount, initialBalance);
    }

    function transfer(address to, uint256 value) public returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public returns (bool) {
        require(
            allowance[from][msg.sender] >= value,
            "ERC20: insufficient allowance"
        );
        _transfer(from, to, value);
        _approve(from, msg.sender, allowance[from][msg.sender] - value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(
            balanceOf[from] >= value,
            "ERC20: transfer amount exceeds balance"
        );
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address account, uint256 value) internal {
        totalSupply += value;
        balanceOf[account] += value;
        emit Transfer(address(0), account, value);
    }

    function _approve(address owner, address spender, uint256 value) internal {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }
}

// test/mocks/NonStandardERC20.sol
contract NonStandardERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(
        string memory _name,
        string memory _symbol,
        address initialAccount,
        uint256 initialBalance
    ) {
        name = _name;
        symbol = _symbol;
        _mint(initialAccount, initialBalance);
    }

    // 非标准：没有返回值
    function transfer(address to, uint256 value) public {
        _transfer(msg.sender, to, value);
    }

    // 非标准：没有返回值
    function approve(address spender, uint256 value) public {
        _approve(msg.sender, spender, value);
    }

    // 非标准：没有返回值
    function transferFrom(address from, address to, uint256 value) public {
        require(
            allowance[from][msg.sender] >= value,
            "ERC20: insufficient allowance"
        );
        _transfer(from, to, value);
        _approve(from, msg.sender, allowance[from][msg.sender] - value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(
            balanceOf[from] >= value,
            "ERC20: transfer amount exceeds balance"
        );
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address account, uint256 value) internal {
        totalSupply += value;
        balanceOf[account] += value;
        emit Transfer(address(0), account, value);
    }

    function _approve(address owner, address spender, uint256 value) internal {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }
}

// test/mocks/USDTLikeToken.sol
contract USDTLikeToken {
    string public name;
    string public symbol;
    uint8 public decimals = 6; // USDT 使用 6 位小数
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(
        string memory _name,
        string memory _symbol,
        address initialAccount,
        uint256 initialBalance
    ) {
        name = _name;
        symbol = _symbol;
        _mint(initialAccount, initialBalance);
    }

    function transfer(address to, uint256 value) public returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    // USDT 特性：如果当前授权不为0，必须先重置为0
    function approve(address spender, uint256 value) public returns (bool) {
        require(
            value == 0 || allowance[msg.sender][spender] == 0,
            "USDT: must reset allowance to 0 first"
        );
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public returns (bool) {
        require(
            allowance[from][msg.sender] >= value,
            "ERC20: insufficient allowance"
        );
        _transfer(from, to, value);
        _approve(from, msg.sender, allowance[from][msg.sender] - value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(
            balanceOf[from] >= value,
            "ERC20: transfer amount exceeds balance"
        );
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address account, uint256 value) internal {
        totalSupply += value;
        balanceOf[account] += value;
        emit Transfer(address(0), account, value);
    }

    function _approve(address owner, address spender, uint256 value) internal {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }
}

// test/mocks/MockUniswapV2Factory.sol
contract MockUniswapV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function setPair(address tokenA, address tokenB, address pair) public {
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }
}

// test/mocks/MockUniswapV2Router.sol
contract MockUniswapV2Router {
    address public factory;
    address public WETH;

    // 用于模拟返回值的变量
    uint256 private returnAmountA;
    uint256 private returnAmountB;
    uint256 private returnLiquidity;

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    function setAddLiquidityReturns(
        uint256 _amountA,
        uint256 _amountB,
        uint256 _liquidity
    ) public {
        returnAmountA = _amountA;
        returnAmountB = _amountB;
        returnLiquidity = _liquidity;
    }

    function setRemoveLiquidityReturns(
        uint256 _amountA,
        uint256 _amountB
    ) public {
        returnAmountA = _amountA;
        returnAmountB = _amountB;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // 简化：直接返回预设值
        amountA = returnAmountA;
        amountB = returnAmountB;
        liquidity = returnLiquidity;

        // 模拟转移代币
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountB);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB) {
        // 简化：直接返回预设值
        amountA = returnAmountA;
        amountB = returnAmountB;

        // 模拟转移代币
        address pair = MockUniswapV2Factory(factory).getPair(tokenA, tokenB);
        IERC20(pair).transferFrom(msg.sender, address(this), liquidity);
        IERC20(tokenA).transfer(to, amountA);
        IERC20(tokenB).transfer(to, amountB);
    }
}

// test/mocks/MockUniswapV2Pair.sol
contract MockUniswapV2Pair {
    address public token0;
    address public token1;
    address public token;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function setToken(address _token) public {
        token = _token;
    }

    function gettoken0() external view returns (address) {
        return token0;
    }

    function gettoken1() external view returns (address) {
        return token1;
    }
}

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
