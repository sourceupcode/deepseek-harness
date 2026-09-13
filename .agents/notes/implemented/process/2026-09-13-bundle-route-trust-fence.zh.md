# Agent Note: /plugins bundle 路由的信任围栏

Status: implemented

[English](2026-09-13-bundle-route-trust-fence.md) | 中文

## 问题

模块系统的 `/plugins` 路由是 webserver 的命名座位：dispatcher 把到达 socket 的每个请求直接交给它，而应用的信任边界——connection service 的 Host/Origin 围栏与浏览器 cookie 检查——只在 index 与 `/api` 通道上强制，不在命名路由上。本改动之前，一个绑定到回环之外的 web 应用会把进程内组合出的每个 client bundle 提供给任何指名该路由的请求，包括 Host 头写的是攻击者域名而非应用权威的 rebound 浏览器——这正是 `/api` 围栏要封住的 confused-deputy 路径。

bundle 不是秘密，但它们是应用代码：组合出的集合正是该部署的插件集合，响应带着会钉住字节的 immutable 缓存头，被提供的 bundle 就是受信任页面执行的产物。index 的承诺——只有 connection service 认证过的会话能到达应用——并不延伸到应用自己的脚本座位，因此这个承诺比组合所暗示的更弱。

## 决定

路由在自己应答处强制应用的信任。组合提供 connection service 时，每个 `/plugins` 请求先通过该服务的 `requestRejection` 检查——Host/Origin 围栏，然后是浏览器认证——路由才检查资源；被拒请求收到围栏的裸 401 或 403：不是 404，也不是任何 bundle 字节。该检查是 connection service 有文档的路由级谓词，与服务自身 `/api` 通道和 index 运行的是同一道围栏；之所以不用 `authorizeIndex`，是因为它拥有自己的响应，且只为 index 执行 token 交换。读取按请求进行，而不是在注册时：组合不提供该服务时路由保持无围栏（它没有可镜像的应用信任——其 index 同样无法被认证），服务在路由注册后才激活也不会漏掉，无需重新注册。路由的资源应答其余不变，worker tunnel 的 carrier 路径把浏览器自身 cookie 带入 tunnel，按构造不受影响。

## 考虑过的替代方案

**在 modules 节点半侧对 connection service 做硬 `inject`。** 声明式注入会给读取加上类型。但 Cordis `inject` 会无限期等待服务：挂载了 modules 却从不提供 connection 的组合会让其 fiber 停在 PENDING 并挂住激活；软读取让围栏恰好以重要的事实——应用是否带有信任边界——为条件。

**在 webserver 里做围栏（路由级标志，或命名路由之前的全局围栏）。** webserver 按设计是纯 dispatcher——它不认识任何 harness 概念，每个路由 handler 直接拥有自己的响应。强制每个路由经过应用信任判断会倒转该分层：检查的谓词与响应是应用策略，而某个属主有意保持开放的路由反而需要 dispatcher 拥有的逃生口。由路由属主强制自己的围栏，dispatcher 保持通用，围栏内容的唯一权威留在 connection service。

**专用 bundle 围栏（自己的 cookie 或路由检查）。** 第二个谓词就是「该请求是否来自应用已认证的会话」的第二事实源。之后任何应用变更——trusted hosts、cookie 寿命、围栏的响应——都要在路由里复制一遍，两道检查恰好在部署变更信任策略时漂移。

## 后果

部署中的 web 应用只向通过应用自身 index 与 `/api` 同一检查的请求提供 `/plugins` bundle：rebound 主机、跨站标记、缺失或陈旧 cookie 的请求收到裸 401 或 403，没有任何 bundle 字节。安装进 profile 的第三方插件 bundle 与应用自身 row 在相同信任下提供——这正是其浏览器半侧能够被提供给应用会话的前提。组合不提供 connection service 时行为与本改动前完全一致；受信任页面不受影响，因为其请求本就携带 index 铸造的 cookie。代价是路由上每请求一次谓词调用。
