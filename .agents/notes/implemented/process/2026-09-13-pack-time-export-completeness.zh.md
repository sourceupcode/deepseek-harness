# Agent Note: 已发布 dsh 闭包的 pack 期 export 完整性

Status: implemented

[English](2026-09-13-pack-time-export-completeness.md) | 中文

## 问题

dsh 发布家族从 `dsh-v*` tag 以单一版本发布每个非 experimental 的 `packages/*/*` 与 `apps/*` 成员。现有的 pack 期 payload 检查只拒绝成员绝不能发布的东西——源文件与声明图——对成员 manifest *承诺* 的东西则只字未提：`files` 字段遗漏的 export target 照样发布成功，而本仓库内的每个消费者都毫发无伤，因为 workspace 链接会透过包目录解析到缺失产物的源。

这种不可见性对第一批外部消费者来说就是缺陷。在本仓库之外构建的设置卡片——第一个是 `@sourceupcode/dsh-oidc`，其浏览器半侧透过已发布的 `dsh-client-ui-settings`、`dsh-client-ui-settings-plugins`、`dsh-client-store`、`dsh-client-ui-slots` 的 export map 解析类型与运行时代码——没有 workspace 链接可以兜底。一个闭包成员若发布了指向悬空 export target 的包，会在每个这样的消费者安装时就坏掉，而且这个坏法从本仓库无从诊断：pack 步骤成功了，tarball 是合法 npm 包，仓库内部也没有任何东西会去解析那个悬空 target。

## 决策

### 检查

dsh 家族的 pack 期 payload 校验（`scripts/publication-payload.ts`，由 `DshFamily.validatePayload` 应用）现在多跑一道 `validateDeclaredExports`：成员 manifest 声明的每个非源 export target——字符串根形式、子路径字符串、条件表条目——都必须存在于 tarball 成员之中。三项豁免保持该检查与其所守护的发布策略一致：

- **仅源 target 与子路径**（`src` 与 `src/...`，包括客户端 manifest 声明的 `./src/*` 通配子路径）跳过：payload 从不发布 `src/`，而这些子路径服务于透过包链接解析的 workspace 消费者。
- **`package.json`** 豁免，因为 npm 保证每个 payload 都有它。
- **通配子路径条目**选不出具体 target，跳过而不做模式匹配。

不受支持的 `exports` 形式（数组条件、非字符串条件 target）会带条目名让 pack 失败，而不是被静默解释。

### 闭包

该保证对整个家族成立，而非按卡片所需列清单：每个 dsh 成员的已声明 target 都受检，所以外部设置卡片消费的闭包——`dsh-client-ui-slots`、`dsh-client-ui-settings`（设置 scope、schema 服务、slot 契约）、`dsh-client-store`、`dsh-client-ui-settings-plugins`（`settings.plugin.item` slot 类型），以及卡片已有的 `dsh-client-connection`、`-locale`、`-ui-renderer`、`-ui-session`、`-ui-commands`、`-ui-conversation`、`-ui-primitives`、`-ui-dockkit` 闭包——由家族成员资格加此检查覆盖，任何未来的外部消费者也被同一条规则覆盖。当前发布集没有任何 manifest 需要为通过检查而改动；干净树上的演练就是证据。

vendor 家族保留自己的 payload 策略：它按设计发布源码与声明图，所以 dsh 闭包检查刻意不延伸到它。

## 已考虑的替代方案

**发布脚本里硬编码的闭包白名单。** 卡片包名的命名清单只能守护已知的那个消费者，且卡片今天没命名的包一旦需要它就立刻腐烂；清单也是「家族发布什么」的第二事实源，而家族 manifest 模式已经拥有这一事实。逐成员检查覆盖同样的范围而不带清单。

**CI 里的 registry 解析检查（从 registry 安装已发布版本并导入其类型）。** 那会端到端验证真实消费者路径，但演练需要发布凭据，还把本地 pack 检查耦合到 registry 的当前状态——正是家族设计要从三条序列之间移除的那种耦合。它也只在发布之后才能跑，而这个检查的要害恰恰是阻止发布。本地 pack 检查在上传前裁定；registry 继续充当账本。

**逐包的 `files` 审计测试。** 一个 workspace 级测试断言每个 manifest 的 target 在盘上可解析，会在不同输入（checkout 而非组装后的 payload）上重复 pack 步骤的活，并且对「`files` 通配符正确但构建产物挪了」的成员照样放行。pack 步骤是发布字节存在的唯一点；检查就住在这里。

## 后果

未来任何删掉 `files` 条目或挪走 manifest 所指产物的重构，现在会在 dsh 发布演练上失败，成员与缺失 target 都会被点名，版本到不了 registry——外部卡片无从诊断的那种失败，变成了发布操作者能够诊断的那种失败。代价是 pack 时每个已声明 target 一次成员表查询，落在操作者本就要读的 pack 日志里。

保证范围止于已声明 target：manifest 从未命名的产物不在其内，而按 manifest 未声明的路径直接伸手进 `node_modules` 的消费者，也不在本规则所护之列。vendor 家族的源码与声明图 payload 不变。dsh-oidc 卡片是该闭包的第一消费者；它对已发布 `0.1.5-rc.2` 集合的构建，是「该保证匹配真实消费者所需」的常设证明。
