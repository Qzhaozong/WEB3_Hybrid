// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title UniswapV2LiquidityManager
 * @dev 安全的 Uniswap V2 流动性管理合约，支持添加/移除流动性，兼容非标准 ERC20 代币
 * 核心优化：资产隔离、授权安全、自定义滑点/Deadline、资产提取、事件记录
 */
contract UniswapV2LiquidityManager {
    // ============ 可配置参数（通过构造函数传入，解耦硬编码） ============
    address public immutable factory;
    address public immutable router;
    address public immutable weth;

    // ============ 状态变量（用户资产隔离） ============
    // 用户 => (代币对 => LP 余额)：记录用户存入的 LP 代币
    mapping(address => mapping(bytes32 => uint256)) public userLPBalances;
    // 用户 => 代币 => 待提取余额：记录用户转入但未操作的代币/移除流动性后的代币
    mapping(address => mapping(address => uint256)) public userTokenBalances;

    // ============ 事件定义（可追溯操作） ============
    event LiquidityAdded(
        address indexed user,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );
    event LiquidityRemoved(
        address indexed user,
        address indexed tokenA,
        address indexed tokenB,
        uint256 liquidity,
        uint256 amountA,
        uint256 amountB
    );
    event TokenWithdrawn(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    // ============ 修饰器（合法性校验） ============
    /**
     * @dev 校验代币地址是否有效（非零地址 + 是合约）
     */
    modifier validToken(address _token) {
        require(_token != address(0), "Invalid: zero token address");
        require(_isContract(_token), "Invalid: not a contract");
        _;
    }

    /**
     * @dev 校验金额是否大于 0
     */
    modifier nonZeroAmount(uint256 _amount) {
        require(_amount > 0, "Invalid: zero amount");
        _;
    }

    // ============ 构造函数（初始化核心地址） ============
    constructor(
        address _factory,
        address _router,
        address _weth
    ) validToken(_factory) validToken(_router) validToken(_weth) {
        factory = _factory;
        router = _router;
        weth = _weth;
    }

    // ============ 核心功能：添加流动性 ============
    /**
     * @dev 为指定代币对添加流动性
     * @param _tokenA 代币A地址
     * @param _tokenB 代币B地址
     * @param _amountA 代币A期望数量
     * @param _amountB 代币B期望数量
     * @param _amountAMin 代币A最小接受数量（滑点下限）
     * @param _amountBMin 代币B最小接受数量（滑点下限）
     * @param _deadline 交易截止时间（防止MEV/延迟攻击）
     */
    function addLiquidity(
        address _tokenA,
        address _tokenB,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _amountAMin,
        uint256 _amountBMin,
        uint256 _deadline
    )
        external
        validToken(_tokenA)
        validToken(_tokenB)
        nonZeroAmount(_amountA)
        nonZeroAmount(_amountB)
        nonZeroAmount(_amountAMin)
        nonZeroAmount(_amountBMin)
    {
        // 校验截止时间未过期
        require(_deadline > block.timestamp, "Invalid: deadline expired");
        // 校验滑点下限合理性
        require(_amountAMin <= _amountA, "Invalid: minA > desiredA");
        require(_amountBMin <= _amountB, "Invalid: minB > desiredB");

        // 1. 转移用户代币到合约，并记录余额
        _safeTransferFrom(IERC20(_tokenA), msg.sender, address(this), _amountA);
        _safeTransferFrom(IERC20(_tokenB), msg.sender, address(this), _amountB);

        // 2. 安全授权（先重置为0，兼容USDT等非标准代币）
        _safeApprove(IERC20(_tokenA), router, _amountA);
        _safeApprove(IERC20(_tokenB), router, _amountB);

        // 3. 调用Uniswap Router添加流动性
        (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        ) = IUniswapV2Router(router).addLiquidity(
                _tokenA,
                _tokenB,
                _amountA,
                _amountB,
                _amountAMin,
                _amountBMin,
                address(this),
                _deadline
            );

        // 4. 记录用户LP余额（代币对按字典序哈希，避免A/B顺序问题）
        bytes32 pairKey = _getPairKey(_tokenA, _tokenB);
        userLPBalances[msg.sender][pairKey] += liquidity;

        // 5. 清除授权（防止残留授权被利用）
        _safeApprove(IERC20(_tokenA), router, 0);
        _safeApprove(IERC20(_tokenB), router, 0);

        // 6. 释放事件
        emit LiquidityAdded(
            msg.sender,
            _tokenA,
            _tokenB,
            amountA,
            amountB,
            liquidity
        );
    }

    // ============ 核心功能：移除流动性 ============
    /**
     * @dev 移除指定代币对的流动性
     * @param _tokenA 代币A地址
     * @param _tokenB 代币B地址
     * @param _liquidity 要移除的LP数量
     * @param _amountAMin 代币A最小接受数量（滑点下限）
     * @param _amountBMin 代币B最小接受数量（滑点下限）
     * @param _deadline 交易截止时间
     */
    function removeLiquidity(
        address _tokenA,
        address _tokenB,
        uint256 _liquidity,
        uint256 _amountAMin,
        uint256 _amountBMin,
        uint256 _deadline
    )
        external
        validToken(_tokenA)
        validToken(_tokenB)
        nonZeroAmount(_liquidity)
        nonZeroAmount(_amountAMin)
        nonZeroAmount(_amountBMin)
    {
        // 校验截止时间未过期
        require(_deadline > block.timestamp, "Invalid: deadline expired");

        // 1. 获取LP代币地址，并校验用户LP余额充足
        address pair = IUniswapV2Factory(factory).getPair(_tokenA, _tokenB);
        require(pair != address(0), "Invalid: pair not exist");
        bytes32 pairKey = _getPairKey(_tokenA, _tokenB);
        require(
            userLPBalances[msg.sender][pairKey] >= _liquidity,
            "Insufficient: LP balance"
        );

        // 2. 安全授权LP代币给Router
        _safeApprove(IERC20(pair), router, _liquidity);

        // 3. 调用Uniswap Router移除流动性
        (uint256 amountA, uint256 amountB) = IUniswapV2Router(router)
            .removeLiquidity(
                _tokenA,
                _tokenB,
                _liquidity,
                _amountAMin,
                _amountBMin,
                address(this),
                _deadline
            );

        // 4. 更新用户LP余额，并记录提取的代币余额
        userLPBalances[msg.sender][pairKey] -= _liquidity;
        userTokenBalances[msg.sender][_tokenA] += amountA;
        userTokenBalances[msg.sender][_tokenB] += amountB;

        // 5. 清除授权
        _safeApprove(IERC20(pair), router, 0);

        // 6. 释放事件
        emit LiquidityRemoved(
            msg.sender,
            _tokenA,
            _tokenB,
            _liquidity,
            amountA,
            amountB
        );
    }

    // ============ 辅助功能：提取代币 ============
    /**
     * @dev 提取合约内属于自己的代币（解决资产锁死问题）
     * @param _token 要提取的代币地址
     * @param _amount 提取数量
     */
    function withdrawToken(
        address _token,
        uint256 _amount
    ) external validToken(_token) nonZeroAmount(_amount) {
        require(
            userTokenBalances[msg.sender][_token] >= _amount,
            "Insufficient: token balance"
        );

        // 更新用户余额
        userTokenBalances[msg.sender][_token] -= _amount;
        // 安全转账给用户
        _safeTransfer(IERC20(_token), msg.sender, _amount);

        // 释放事件
        emit TokenWithdrawn(msg.sender, _token, _amount);
    }

    // ============ 内部工具函数 ============
    /**
     * @dev 安全的transferFrom（兼容非标准ERC20，无返回值的代币）
     */
    function _safeTransferFrom(
        IERC20 token,
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = address(token).call(
            abi.encodeCall(IERC20.transferFrom, (sender, recipient, amount))
        );
        require(
            success &&
                (returnData.length == 0 || abi.decode(returnData, (bool))),
            "TransferFrom failed"
        );
    }

    /**
     * @dev 安全的transfer（兼容非标准ERC20）
     */
    function _safeTransfer(
        IERC20 token,
        address recipient,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = address(token).call(
            abi.encodeCall(IERC20.transfer, (recipient, amount))
        );
        require(
            success &&
                (returnData.length == 0 || abi.decode(returnData, (bool))),
            "Transfer failed"
        );
    }

    /**
     * @dev 安全的approve（先重置为0，兼容非标准ERC20）
     */
    function _safeApprove(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        // 先重置授权为0（解决USDT等代币无法直接覆盖非零授权的问题）
        if (token.allowance(address(this), spender) > 0) {
            (bool successZero, bytes memory returnDataZero) = address(token)
                .call(abi.encodeCall(IERC20.approve, (spender, 0)));
            require(
                successZero &&
                    (returnDataZero.length == 0 ||
                        abi.decode(returnDataZero, (bool))),
                "Approve reset failed"
            );
        }

        // 新授权（若授权金额为0，无需再次调用）
        if (amount > 0) {
            (bool success, bytes memory returnData) = address(token).call(
                abi.encodeCall(IERC20.approve, (spender, amount))
            );
            require(
                success &&
                    (returnData.length == 0 || abi.decode(returnData, (bool))),
                "Approve failed"
            );
        }
    }

    /**
     * @dev 判断地址是否为合约
     */
    function _isContract(address _addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }

    /**
     * @dev 生成代币对的唯一Key（按字典序排序，避免A/B顺序问题）
     */
    function _getPairKey(
        address _tokenA,
        address _tokenB
    ) internal pure returns (bytes32) {
        return
            _tokenA < _tokenB
                ? keccak256(abi.encodePacked(_tokenA, _tokenB))
                : keccak256(abi.encodePacked(_tokenB, _tokenA));
    }
}

// ============ 接口定义 ============
interface IUniswapV2Router {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);
}

interface IUniswapV2Factory {
    function getPair(
        address token0,
        address token1
    ) external view returns (address);
}

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool);
    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}
