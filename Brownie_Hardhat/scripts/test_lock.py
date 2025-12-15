# 导入 Brownie 核心模块（负责合约部署、测试环境管理）
import brownie
# 从 Brownie 导入目标合约 Lock 和测试账户列表
from brownie import Lock, accounts
# 导入时间处理模块（模拟时间流逝）
import time
# 从 Brownie 导入单位转换工具（解决 ether 未定义问题）
from brownie.convert import ether

def test_deploy_valid_params():
    """测试1：正常部署（有效解锁时间 + 转入ETH）"""
    # 1. 准备测试环境
    deployer = accounts[0]  # 第一个测试账户作为部署者（默认有 100 ETH 测试币）
    future_unlock_time = int(time.time()) + 60  # 解锁时间设为未来60秒
    deposit_amount = 1 * ether  # 部署时转入 1 ETH（1 ether = 10^18 wei）

    # 2. 执行合约部署
    # Lock.deploy(构造函数参数, 交易参数)
    # value: 部署时向合约转入的 ETH 数量（以 wei 为单位）
    lock_contract = Lock.deploy(
        future_unlock_time,
        {"from": deployer, "value": deposit_amount}
    )

    # 3. 验证部署结果
    # 检查解锁时间是否正确存储
    assert lock_contract.unlockTime() == future_unlock_time, "解锁时间存储错误"
    # 检查合约所有者是否为部署者
    assert lock_contract.owner() == deployer.address, "所有者地址不匹配"
    # 检查合约余额是否等于转入金额
    assert lock_contract.balance() == deposit_amount, "合约余额错误"
    print("✅ 测试1通过：正常部署合约成功")


def test_deploy_past_unlock_time():
    """测试2：无效部署（解锁时间为过去时间，预期失败）"""
    # 1. 准备测试环境
    deployer = accounts[0]
    past_unlock_time = int(time.time()) - 30  # 解锁时间设为30秒前（已过期）

    # 2. 执行 + 验证：预期触发 revert（构造函数中 require 断言失败）
    # brownie.reverts(错误信息)：断言合约抛出指定错误
    with brownie.reverts("Unlock time should be in the future"):
        Lock.deploy(past_unlock_time, {"from": deployer})
    print("✅ 测试2通过：过去时间部署失败（符合预期）")


def test_withdraw_by_owner_after_unlock():
    """测试3：所有者解锁后提款（正常场景）"""
    # 1. 准备测试环境
    deployer = accounts[0]
    unlock_time = int(time.time()) + 5  # 5秒后解锁
    deposit_amount = 2 * ether  # 转入 2 ETH
    lock_contract = Lock.deploy(unlock_time, {"from": deployer, "value": deposit_amount})

    # 等待解锁时间到期（测试环境主动休眠，模拟时间流逝）
    time.sleep(6)  # 休眠6秒，确保已过解锁时间

    # 记录所有者提款前余额（用于验证转账效果）
    owner_balance_before = deployer.balance()

    # 2. 执行提款操作
    tx = lock_contract.withdraw({"from": deployer})  # 所有者调用 withdraw

    # 3. 验证结果
    # 合约余额应为 0（全部提款）
    assert lock_contract.balance() == 0, "合约提款后仍有余额"
    # 所有者余额应增加（扣除 gas 后略少于 deposit_amount）
    assert deployer.balance() > owner_balance_before, "所有者余额未增加"
    # 验证 Withdrawal 事件是否触发，且参数正确
    assert "Withdrawal" in tx.events, "未触发 Withdrawal 事件"
    assert tx.events["Withdrawal"]["amount"] == deposit_amount, "事件金额错误"
    assert tx.events["Withdrawal"]["when"] >= unlock_time, "事件时间戳错误"
    print("✅ 测试3通过：所有者解锁后提款成功")


def test_withdraw_before_unlock():
    """测试4：解锁前提款（预期失败）"""
    # 1. 准备测试环境
    deployer = accounts[0]
    unlock_time = int(time.time()) + 30  # 30秒后解锁
    lock_contract = Lock.deploy(unlock_time, {"from": deployer, "value": 1 * ether})

    # 2. 执行 + 验证：未到解锁时间，提款失败
    with brownie.reverts("You can't withdraw yet"):
        lock_contract.withdraw({"from": deployer})
    print("✅ 测试4通过：解锁前提款失败（符合预期）")


def test_withdraw_by_non_owner():
    """测试5：非所有者提款（预期失败）"""
    # 1. 准备测试环境
    deployer = accounts[0]  # 所有者
    non_owner = accounts[1]  # 非所有者（第二个测试账户）
    unlock_time = int(time.time()) + 5  # 5秒后解锁
    lock_contract = Lock.deploy(unlock_time, {"from": deployer, "value": 1 * ether})

    # 等待解锁时间到期
    time.sleep(6)

    # 2. 执行 + 验证：非所有者提款失败
    with brownie.reverts("You aren't the owner"):
        lock_contract.withdraw({"from": non_owner})  # 非所有者调用 withdraw
    print("✅ 测试5通过：非所有者提款失败（符合预期）")


def test_deploy_with_zero_eth():
    """测试6：零ETH部署（边缘场景）"""
    # 1. 准备测试环境
    deployer = accounts[0]
    unlock_time = int(time.time()) + 10  # 10秒后解锁
    # 部署时不转入 ETH（value 默认为 0）
    lock_contract = Lock.deploy(unlock_time, {"from": deployer})

    # 等待解锁时间到期
    time.sleep(11)

    # 2. 执行提款操作
    tx = lock_contract.withdraw({"from": deployer})

    # 3. 验证结果：事件中金额应为 0
    assert tx.events["Withdrawal"]["amount"] == 0, "零余额提款事件金额错误"
    print("✅ 测试6通过：零ETH部署后提款正常")