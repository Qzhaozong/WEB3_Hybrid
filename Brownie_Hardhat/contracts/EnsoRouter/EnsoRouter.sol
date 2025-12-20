// SPDX-License-Identifier: GPL-3.0-only
// 合约许可证声明：仅使用GPL-3.0
pragma solidity ^0.8.28; // Solidity编译器版本要求：0.8.28或以上

// 导入本地合约
import {EnsoShortcuts} from "./EnsoShortcuts.sol"; // 导入EnsoShortcuts合约，用于执行实际的调用操作

// 从OpenZeppelin导入ERC20相关接口和安全操作库
import {
    SafeERC20, // 安全ERC20操作库，提供安全的代币转账功能
    IERC20 // ERC20代币标准接口
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// 从OpenZeppelin导入ERC721和ERC1155标准接口
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol"; // ERC721非同质化代币标准接口
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol"; // ERC1155多代币标准接口

// 定义代币类型枚举，用于区分不同类型的资产
enum TokenType {
    Native, // 原生代币（如以太坊的ETH）
    ERC20, // ERC20标准代币（同质化代币）
    ERC721, // ERC721标准代币（非同质化代币）
    ERC1155 // ERC1155标准代币（多代币标准）
}

// 定义Token结构体，用于封装代币信息
struct Token {
    TokenType tokenType; // 代币类型，使用上面定义的TokenType枚举
    bytes data; // 代币的额外数据，根据tokenType不同，编码格式不同
}

// 定义EnsoRouter合约
contract EnsoRouter {
    // 引入SafeERC20库的所有函数，使其可以在IERC20类型上直接调用
    using SafeERC20 for IERC20;

    // 状态变量：存储EnsoShortcuts合约地址，该地址是不可变的，一旦初始化就不能更改
    address public immutable shortcuts;

    // 自定义错误定义，用于更精确地报告错误情况
    error WrongMsgValue(uint256 value, uint256 expectedAmount); // 错误：发送的原生代币数量与预期不符
    error AmountTooLow(Token token, uint256 amount, uint256 minAmount); // 错误：接收的代币数量低于最小值
    error DuplicateNativeAsset(); // 错误：重复提供原生代币
    error UnsupportedTokenType(TokenType tokenType); // 错误：不支持的代币类型

    // 构造函数：初始化EnsoRouter合约
    constructor() {
        // 创建一个新的EnsoShortcuts合约实例，并将当前合约地址作为参数传递
        // 将新创建的EnsoShortcuts合约地址赋值给shortcuts状态变量
        shortcuts = address(new EnsoShortcuts(address(this)));
    }

    /// @notice 路由单个代币到shortcuts合约执行操作
    /// @param tokenIn 要发送的代币信息，包含代币类型和编码数据
    /// @param data 要发送到shortcuts合约的调用数据
    /// @return response shortcuts合约调用返回的结果
    function routeSingle(
        Token calldata tokenIn, // 输入代币参数，使用calldata节省gas
        bytes calldata data // 调用数据参数，使用calldata节省gas
    ) public payable returns (bytes memory response) {
        // payable修饰符允许合约接收原生代币
        // 调用内部函数_transfer处理代币转账，并检查是否是原生代币
        bool isNativeAsset = _transfer(tokenIn);

        // 如果是原生代币，检查发送的金额是否与预期一致
        if (isNativeAsset) {
            (uint256 amount) = abi.decode(tokenIn.data, (uint256));
            if (msg.value != amount) revert WrongMsgValue(msg.value, amount);
        }
        // 如果不是原生代币但发送了原生代币，则抛出错误
        else if (msg.value != 0) {
            revert WrongMsgValue(msg.value, 0);
        }

        // 调用内部函数_execute执行shortcuts合约调用
        response = _execute(data);
    }

    /// @notice 路由多个代币到shortcuts合约执行操作
    /// @param tokensIn 要发送的多个代币信息数组
    /// @param data 要发送到shortcuts合约的调用数据
    /// @return response shortcuts合约调用返回的结果
    function routeMulti(
        Token[] calldata tokensIn, // 输入代币数组，使用calldata节省gas
        bytes calldata data // 调用数据参数，使用calldata节省gas
    ) public payable returns (bytes memory response) {
        // payable修饰符允许合约接收原生代币
        // 标记是否已经处理了原生代币
        bool isNativeAsset;
        // 跟踪原生代币的总金额
        uint256 nativeAmount;

        // 遍历所有输入代币
        for (uint256 i; i < tokensIn.length; ++i) {
            // 检查是否是原生代币
            if (tokensIn[i].tokenType == TokenType.Native) {
                // 如果已经处理过原生代币，则抛出重复原生代币错误
                if (isNativeAsset) revert DuplicateNativeAsset();
                // 解码获取原生代币金额
                (uint256 amount) = abi.decode(tokensIn[i].data, (uint256));
                // 累加原生代币金额
                nativeAmount = amount;
                // 标记已经处理了原生代币
                isNativeAsset = true;
            }

            // 调用内部函数_transfer处理代币转账
            _transfer(tokensIn[i]);
        }

        // 检查原生代币金额是否与发送的金额一致
        if (msg.value != nativeAmount) {
            revert WrongMsgValue(msg.value, nativeAmount);
        }

        // 调用内部函数_execute执行shortcuts合约调用
        response = _execute(data);
    }

    /// @notice 安全路由单个代币，确保接收的代币数量不低于最小值
    /// @param tokenIn 要发送的代币信息
    /// @param tokenOut 预期接收的代币信息，包含最小接收数量
    /// @param receiver 接收代币的地址
    /// @param data 要发送到shortcuts合约的调用数据
    /// @return response shortcuts合约调用返回的结果
    function safeRouteSingle(
        Token calldata tokenIn, // 输入代币参数
        Token calldata tokenOut, // 输出代币参数，包含最小接收数量
        address receiver, // 接收者地址
        bytes calldata data // 调用数据参数
    ) external payable returns (bytes memory response) {
        // external修饰符限制仅外部调用
        // 获取接收者在操作前的代币余额
        uint256 balance = _balance(tokenOut, receiver);

        // 调用routeSingle函数执行代币路由
        response = routeSingle(tokenIn, data);

        // 检查接收的代币数量是否达到最小值
        _checkMinAmountOut(tokenOut, receiver, balance);
    }

    /// @notice 安全路由多个代币，确保接收的每个代币数量不低于各自的最小值
    /// @param tokensIn 要发送的多个代币信息数组
    /// @param tokensOut 预期接收的多个代币信息数组，每个包含最小接收数量
    /// @param receiver 接收代币的地址
    /// @param data 要发送到shortcuts合约的调用数据
    /// @return response shortcuts合约调用返回的结果
    function safeRouteMulti(
        Token[] calldata tokensIn, // 输入代币数组
        Token[] calldata tokensOut, // 输出代币数组，每个包含最小接收数量
        address receiver, // 接收者地址
        bytes calldata data // 调用数据参数
    ) external payable returns (bytes memory response) {
        // external修饰符限制仅外部调用
        // 创建一个数组来存储每个输出代币在操作前的余额
        uint256[] memory balances = new uint256[](tokensOut.length);

        // 遍历所有输出代币，获取接收者在操作前的余额
        for (uint256 i; i < tokensOut.length; ++i) {
            balances[i] = _balance(tokensOut[i], receiver);
        }

        // 调用routeMulti函数执行多个代币路由
        response = routeMulti(tokensIn, data);

        // 检查每个接收的代币数量是否达到各自的最小值
        for (uint256 i; i < tokensOut.length; ++i) {
            _checkMinAmountOut(tokensOut[i], receiver, balances[i]);
        }
    }

    /// @notice 内部函数：执行对shortcuts合约的调用
    /// @param data 要发送到shortcuts合约的调用数据
    /// @return response shortcuts合约调用返回的结果
    function _execute(
        bytes calldata data // 调用数据参数
    ) internal returns (bytes memory response) {
        // internal修饰符限制仅内部调用
        // 标记调用是否成功
        bool success;

        // 使用call函数调用shortcuts合约，并转发所有接收到的原生代币
        (success, response) = shortcuts.call{value: msg.value}(data);

        // 如果调用失败，则使用内联汇编回滚并返回错误信息
        if (!success) {
            assembly {
                revert(add(response, 32), mload(response)) // 将response的前32字节作为长度，后面作为数据回滚
            }
        }
    }

    /// @notice 内部函数：处理代币转账
    /// @param token 要转账的代币信息
    /// @return isNativeAsset 标记是否是原生代币转账
    function _transfer(
        Token calldata token // 要转账的代币信息
    ) internal returns (bool isNativeAsset) {
        // internal修饰符限制仅内部调用
        // 获取代币类型
        TokenType tokenType = token.tokenType;

        // 根据代币类型处理不同的转账逻辑
        if (tokenType == TokenType.ERC20) {
            // 解码token.data获取ERC20代币合约地址和转账金额
            (IERC20 erc20, uint256 amount) = abi.decode(
                token.data,
                (IERC20, uint256)
            );
            // 使用SafeERC20的safeTransferFrom函数安全地从发送者转账到shortcuts合约
            erc20.safeTransferFrom(msg.sender, shortcuts, amount);
        } else if (tokenType == TokenType.Native) {
            // 解码token.data获取原生代币转账金额
            (uint256 amount) = abi.decode(token.data, (uint256));
            // 标记这是原生代币转账（不再检查msg.value，移到上层函数处理）
            isNativeAsset = true;
        } else if (tokenType == TokenType.ERC721) {
            // 解码token.data获取ERC721代币合约地址和代币ID
            (IERC721 erc721, uint256 tokenId) = abi.decode(
                token.data,
                (IERC721, uint256)
            );
            // 使用ERC721的safeTransferFrom函数安全地从发送者转账到shortcuts合约
            erc721.safeTransferFrom(msg.sender, shortcuts, tokenId);
        } else if (tokenType == TokenType.ERC1155) {
            // 解码token.data获取ERC1155代币合约地址、代币ID和转账数量
            (IERC1155 erc1155, uint256 tokenId, uint256 amount) = abi.decode(
                token.data,
                (IERC1155, uint256, uint256)
            );
            // 使用ERC1155的safeTransferFrom函数安全地从发送者转账到shortcuts合约
            erc1155.safeTransferFrom(
                msg.sender,
                shortcuts,
                tokenId,
                amount,
                "0x" // 额外数据，这里为空
            );
        } else {
            // 如果是不支持的代币类型，则抛出错误
            revert UnsupportedTokenType(tokenType);
        }
    }

    /// @notice 内部函数：获取指定地址的代币余额
    /// @param token 要查询的代币信息
    /// @param receiver 要查询的地址
    /// @return balance 查询到的代币余额
    function _balance(
        Token calldata token, // 要查询的代币信息
        address receiver // 要查询的地址
    ) internal view returns (uint256 balance) {
        // internal view修饰符限制仅内部调用，且不修改状态
        // 获取代币类型
        TokenType tokenType = token.tokenType;

        // 根据代币类型查询不同的余额
        if (tokenType == TokenType.ERC20) {
            // 解码token.data获取ERC20代币合约地址
            (IERC20 erc20, ) = abi.decode(token.data, (IERC20, uint256));
            // 查询接收者的ERC20代币余额
            balance = erc20.balanceOf(receiver);
        } else if (tokenType == TokenType.Native) {
            // 查询接收者的原生代币余额
            balance = receiver.balance;
        } else if (tokenType == TokenType.ERC721) {
            // 解码token.data获取ERC721代币合约地址
            (IERC721 erc721, ) = abi.decode(token.data, (IERC721, uint256));
            // 查询接收者的ERC721代币余额
            balance = erc721.balanceOf(receiver);
        } else if (tokenType == TokenType.ERC1155) {
            // 解码token.data获取ERC1155代币合约地址和代币ID
            (IERC1155 erc1155, uint256 tokenId, ) = abi.decode(
                token.data,
                (IERC1155, uint256, uint256)
            );
            // 查询接收者的ERC1155代币余额
            balance = erc1155.balanceOf(receiver, tokenId);
        } else {
            // 如果是不支持的代币类型，则抛出错误
            revert UnsupportedTokenType(tokenType);
        }
    }

    /// @notice 内部函数：检查接收的代币数量是否达到最小值
    /// @param token 要检查的代币信息，包含最小接收数量
    /// @param receiver 接收代币的地址
    /// @param prevBalance 操作前的代币余额
    function _checkMinAmountOut(
        Token calldata token, // 要检查的代币信息
        address receiver, // 接收者地址
        uint256 prevBalance // 操作前的余额
    ) internal view {
        // internal view修饰符限制仅内部调用，且不修改状态
        // 获取代币类型
        TokenType tokenType = token.tokenType;

        // 声明变量存储当前余额和最小接收数量
        uint256 balance;
        uint256 minAmountOut;

        // 根据代币类型查询当前余额和最小接收数量
        if (tokenType == TokenType.ERC20) {
            IERC20 erc20;
            // 解码token.data获取ERC20代币合约地址和最小接收数量
            (erc20, minAmountOut) = abi.decode(token.data, (IERC20, uint256));
            // 查询接收者的当前ERC20代币余额
            balance = erc20.balanceOf(receiver);
        } else if (tokenType == TokenType.Native) {
            // 解码token.data获取原生代币的最小接收数量
            (minAmountOut) = abi.decode(token.data, (uint256));
            // 查询接收者的当前原生代币余额
            balance = receiver.balance;
        } else if (tokenType == TokenType.ERC721) {
            IERC721 erc721;
            // 解码token.data获取ERC721代币合约地址和最小接收数量
            (erc721, minAmountOut) = abi.decode(token.data, (IERC721, uint256));
            // 查询接收者的当前ERC721代币余额
            balance = erc721.balanceOf(receiver);
        } else if (tokenType == TokenType.ERC1155) {
            IERC1155 erc1155;
            uint256 tokenId;
            // 解码token.data获取ERC1155代币合约地址、代币ID和最小接收数量
            (erc1155, tokenId, minAmountOut) = abi.decode(
                token.data,
                (IERC1155, uint256, uint256)
            );
            // 查询接收者的当前ERC1155代币余额
            balance = erc1155.balanceOf(receiver, tokenId);
        } else {
            // 如果是不支持的代币类型，则抛出错误
            revert UnsupportedTokenType(tokenType);
        }

        // 计算实际接收的代币数量
        uint256 amountOut = balance - prevBalance;

        // 如果实际接收数量小于最小接收数量，则抛出错误
        if (amountOut < minAmountOut)
            revert AmountTooLow(token, amountOut, minAmountOut);
    }
}
