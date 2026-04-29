AI Chat 本地网页与转发服务运行说明

一、文件说明

本项目主要包含以下文件：

1. index.html
   网页聊天界面。

2. proxy-server.mjs
   本地 Node.js 转发服务，同时负责打开网页和转发普通聊天、生图请求。

3. setup-local-service.ps1
   Windows 一键启动脚本。推荐在另一台电脑上直接运行这个脚本。

4. chatgpt-icon.png
   网页图标。


二、运行前准备

1. 安装 Node.js 20 或更新版本

   下载地址：
   https://nodejs.org/

2. 把整个项目文件夹复制到另一台电脑

   请确保 index.html、proxy-server.mjs、setup-local-service.ps1 在同一个文件夹内。


三、推荐启动方式

在项目文件夹空白处按住 Shift 并右键，选择“在终端中打开”或“在 PowerShell 中打开”，然后运行：

powershell -ExecutionPolicy Bypass -File .\setup-local-service.ps1

脚本会依次询问：

1. Local port
   本地服务端口，默认 8787。

2. Chat API base URL
   普通聊天接口地址，例如：
   https://api.openai.com

   如果你使用兼容接口，请填写兼容接口的 Base URL。

3. Chat model
   普通聊天模型，默认：
   gpt-5.5

4. Chat API style
   默认填写 chat 即可。

5. Image API base URL
   生图接口地址。一般可以和 Chat API base URL 相同。

6. Image model
   生图模型，默认：
   gpt-image-2

7. Image API path
   生图接口路径，默认：
   /v1/images/generations

8. API key
   填写你的接口密钥。输入时不会显示在屏幕上。


四、启动成功后

脚本会自动打开：

http://127.0.0.1:8787/

请保持 PowerShell 窗口不要关闭。关闭窗口或按 Ctrl+C 会停止本地服务。

通过这个地址打开网页时，页面会自动使用本地转发服务：

普通聊天：
http://127.0.0.1:8787/v1/chat/completions

生图：
http://127.0.0.1:8787/api/image/generations


五、不想自动打开浏览器

可以加上 -NoOpen：

powershell -ExecutionPolicy Bypass -File .\setup-local-service.ps1 -NoOpen


六、命令行直接传参

也可以不交互，直接传入参数：

powershell -ExecutionPolicy Bypass -File .\setup-local-service.ps1 -Port 8787 -Target "https://api.openai.com" -Model "gpt-5.5" -ImageTarget "https://api.openai.com" -ImageModel "gpt-image-2"

API Key 也可以用参数传入，但不推荐，因为命令历史可能会保存明文密钥：

-ApiKey "你的聊天 API Key"
-ImageApiKey "你的生图 API Key"


七、常见问题

1. 提示找不到 node

   说明电脑还没安装 Node.js，或安装后没有重新打开 PowerShell。
   请安装 Node.js 20 或更新版本，然后重新打开 PowerShell 再运行脚本。

2. 提示端口 8787 已被占用

   可以换一个端口，例如：

   powershell -ExecutionPolicy Bypass -File .\setup-local-service.ps1 -Port 8790

   打开地址也会变成：
   http://127.0.0.1:8790/

3. 网页打开后请求失败

   请检查：

   - API Key 是否正确
   - Chat API base URL 是否正确
   - 模型名是否被你的接口服务支持
   - 生图接口是否支持 gpt-image-2
   - Image API path 是否是 /v1/images/generations 或你的服务要求的路径

4. 直接双击 index.html 可以打开吗

   可以打开界面，但推荐通过 setup-local-service.ps1 启动。
   通过本地服务打开时，网页会自动配置本地代理，跨域和转发问题更少。


八、停止服务

回到启动脚本的 PowerShell 窗口，按：

Ctrl+C

即可停止本地服务。
