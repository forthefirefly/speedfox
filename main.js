const { app, BrowserWindow, Tray, Menu , ipcMain, dialog, shell } = require('electron');

const path = require('path');
const fs = require('fs');
const { spawn, exec ,execFile } = require('child_process');
const os = require('os');
const yaml = require('js-yaml');
const request = require('request');
const net = require('net');

const {logger, LOG_FILE_PATH} = require('./helper/logger');

var localesPath = process.cwd();
const silent = process.argv.includes('-silent')
  ? true
  : false;

/***  错误不弹出  ***
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});*/

process.argv.forEach(function (item, index, array) {
  if (item.includes("-workdir")) {
    argv = item.split("=");
    logger.debug("workdir:", argv[1]);
    localesPath = argv[1];
  }
});

const {KillAllProcess, OpenExternalProgram} = require('./helper/process');
const {batchAddHostRecords, batchRemoveHostRecords} = require('./helper/hosts');

let loadWindow, mainWindow, tipsWindow = null;

const appVersion       = app.getVersion();
const MAIN_UI_URL      = "https://test.client.jihujiasuqi.com/home.php"; // 服务器web位置
const LOADING_PAGE_URL = path.join(localesPath, "bin\\static\\load\\index.html");

const MAIN_WINDOW_CONFIG = {
  width: 1000,
  height: 700,
  frame: false, // 隐藏窗口的标题栏
  transparent: true,// 透明窗口
  show:false, // 隐藏窗口
  // 窗口可调整大小
  resizable: false,
  autoHideMenuBar: true, // 自动隐藏菜单栏
  fullscreenable: false, // 禁止f11全屏
  webPreferences: {
    nodeIntegration: false, // 允许在渲染进程中使用 Node.js
    contextIsolation: true, // 取消上下文隔离
    enableRemoteModule: true, // 允许使用 remote 模块（如果需要）
    allowRunningInsecureContent: true, // 允许不安全的内容运行
    webSecurity:false,
    preload: path.join(__dirname, "preload.js")
  }
};
const LOAD_WINDOW_CONFIG = {
  width: 600,
  height: 600,
  transparent: true,// 透明窗口
  frame: false, // 隐藏窗口的标题栏
  show: false, // 隐藏窗口
  // 窗口可移动
  movable: true,
  // 窗口可调整大小
  resizable: false,
  // 窗口不能最小化
  minimizable: false,
  // 窗口不能最大化
  maximizable: false,
  // 窗口不能进入全屏状态
  fullscreenable: false,
  // 窗口不能?关闭
  closable: true,

  autoHideMenuBar: true, // 自动隐藏菜单栏
  webPreferences: {
    nodeIntegration: true, // 允许在渲染进程中使用 Node.js
    contextIsolation: false, // 取消上下文隔离
    enableRemoteModule: true, // 允许使用 remote 模块（如果需要）
    webSecurity: false
  }
};

const TIPS_WINDOW_CONFIG = {
  width: 340,
  height: 95,
  x: 0,
  y: 150,
  transparent: true,// 透明窗口
  frame: false, // 隐藏窗口的标题栏
  show:false, // 隐藏窗口
  // 窗口可移动
  movable: true,
  // 窗口可调整大小
  resizable: false,
  // 窗口不能最小化
  minimizable: false,
  // 窗口不能最大化
  maximizable: false,
  // 窗口不能进入全屏状态
  fullscreenable: false,
  // 窗口不能关闭
  closable: true,

  alwaysOnTop: true,// 最顶层

  autoHideMenuBar: true, // 自动隐藏菜单栏
  webPreferences: {
    nodeIntegration: true, // 允许在渲染进程中使用 Node.js
    contextIsolation: false, // 取消上下文隔离
    enableRemoteModule: true, // 允许使用 remote 模块（如果需要）
    webSecurity:false
  }
};


// 请勿随意更新版基座本号，否则渲染层网页无法自动识别基座本号，导致新功能无法使用
const Framework = {
  version : appVersion
}

const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  })
}

// 性能优化
app.commandLine.appendSwitch('disable-gpu-vsync'); // 禁用垂直同步
app.commandLine.appendSwitch('max-gum-fps', '30'); // 设置最大帧率为30 似乎没用?
app.commandLine.appendSwitch('no-proxy-server');// 禁用代理

// 合并渲染进程
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('process-per-site');
app.commandLine.appendSwitch('lang', 'en-US');

var startUpTimeout;
var myAppDataPath;

logger.info("[app] Starting...");

KillAllProcess();
batchRemoveHostRecords('# Speed Fox');

app.whenReady().then(() => {
  myAppDataPath = app.getPath('appData');
  if (!silent) {
    CreateLoadingWindow();
  }
  startUpTimeout = setTimeout(() => {
    loadWindow.close();
    ExitApp();
  }, 15 * 1000);
  CreateMainWindow();
});

app.on('window-all-closed', function () {
  ExitApp();
  // if (process.platform !== 'darwin'){ }
});

function Fox_writeFile(filePath, textToWrite) {
  fs.writeFile(filePath, textToWrite, (err) => {
    if (err) {
      logger.error(`[Fox_writeFile] Failed writing file to ${filePath}`);
      return;
    }
  });
}

function CreateLoadingWindow() {
  loadWindow = new BrowserWindow(LOAD_WINDOW_CONFIG);
  loadWindow.loadFile(LOADING_PAGE_URL);
  loadWindow.on('closed', function () {
    loadWindow = null;
  });
  loadWindow.once('ready-to-show',() => {
    loadWindow.setSkipTaskbar(true);
    loadWindow.webContents.send('Framework', Framework);
    loadWindow.show();
    // loadWindow.setIgnoreMouseEvents(true) ?
   });
}

function CreateMainWindow() {
  mainWindow = new BrowserWindow(MAIN_WINDOW_CONFIG);
  var ui_url = new URL(MAIN_UI_URL);
  ui_url.searchParams.append('product', app.getName());
  ui_url.searchParams.append('silent', silent);
  mainWindow.loadURL(ui_url.href);
  mainWindow.on('closed', function () {
    // logStream.end();
    mainWindow = null;
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
      mainWindow.setMenuBarVisibility(false);
      mainWindow.webContents.send('Framework', Framework);
    let tray = new Tray(path.join(localesPath, 'bin/static/logo/'+app.getName()+'.ico'));
    const contextMenu = Menu.buildFromTemplate(
      [
        { label: '显示', click: () => { mainWindow.show(); } },
        { label: '退出', click: () => { ExitApp() } }
    ]);
    // tray.setToolTip(app_config.app.ToolTip);
    tray.setContextMenu(contextMenu);
    
    // 单击托盘图标显示窗口
    tray.on('click', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
        // event.preventDefault();
        ExitApp();
        // mainWindow.hide();
    }
    // return false;
  });

}
//TODO:
function tips_Window(data) {
  tipsWindow = new BrowserWindow(TIPS_WINDOW_CONFIG);
  var tips_url = new URL(data.url);
  tips_url.searchParams.append('product', app.getName());
  tipsWindow.loadURL(ui_url.href);
  // tipsWindow.loadURL('https://api.jihujiasuqi.com/app_ui/pc/page/tips/tips.php');
  tipsWindow.on('closed', function () {
    tipsWindow = null;
  });
  tipsWindow.once('ready-to-show',()=>{
    tipsWindow.setSkipTaskbar(true);
    tipsWindow.show();
    tipsWindow.setIgnoreMouseEvents(true);
   });


   setTimeout(() => {
    tipsWindow.close();
   }, 1000 * 8);

}

// TODO: 实际上失效
function socks_test(tag, test_socks) {
  
  const socks_test = exec(`"${path.join(localesPath, 'bin\\curl.exe')}" --socks5-hostname ${test_socks} http://www.baidu.com/ -v`);
  
  logger.debug(
    `[socks_test] TAG: ${tag} - test_socks: ${test_socks}`
  );
  // 监听子进程的标准错误数据
  socks_test.stderr.on('data', (data) => {
    logger.debug(`[socks_test] : ${data}`);
    if (data.includes('HTTP/1.1 200 OK')) {
      logger.info("[socks_test] SOCKS 可用");
      mainWindow.webContents.send('speed_code', { "status":"ok", "tag": tag });// 发送基座信息给渲染层
    }
    else if (data.includes("Can't complete")){
      logger.warn(
        "[socks_test] SOCKS 不可用 socks检测出错,连接失败"
      );
      mainWindow.webContents.send('speed_code', {"start":"SOCKS ERR","msg":"socks检测出错,连接失败","tag":tag});
    }
    else if (data.includes("Empty reply from server")) {
      logger.warn(
        "[socks_test] SOCKS 不可用 socks检测出错,主机空回复"
      );
      mainWindow.webContents.send('speed_code', {"start":"SOCKS ERR","msg":"socks检测出错,主机空回复","tag":tag});
    }
  });
}

function ExitApp() {
  logger.info('[ExitApp]');
  mainWindow.show();
  mainWindow.focus();
  KillAllProcess();
  batchRemoveHostRecords('# Speed Fox');
  app.isQuiting = true;
  app.quit();
}

ipcMain.on('loadingWindow', (eveent, arg) => {
  loadWindow.hide();
  loadWindow.close();
  clearTimeout(startUpTimeout);
});
ipcMain.on('mainWindow', (event, arg) => {
  switch (arg) {
    case 'show':
      mainWindow.show();
      mainWindow.setMenuBarVisibility(false);
      mainWindow.webContents.send('Framework', Framework);
      break;
    case 'hide':
      mainWindow.hide();
      break;
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'openDevTools':
      mainWindow.webContents.openDevTools();
      break;
    default:
      logger.warn(`[mainWindow listener] Unknown flag ${arg}`)
  }
});
ipcMain.on('window', (event, arg) => {
  if (arg[0] == "tips") {
    if (arg[1] == "show") {
      tipsWindow.show();
    }
    else {
      tipsWindow.hide();
    }
  }
  event.reply('reply-window', 'ok');
});

ipcMain.on('speed_tips_Window', (event, arg) => {
  tips_Window(arg);
});

function Ping(host, timeout, pingid) {

  port = host.split(":")[1];
  host = host.split(":")[0];
  const startTime = Date.now();
  var socket = net.createConnection({ host, port });
  var ping_replydata = {
    ms: 0,
    pingid: pingid,
    res: {
      time: 0,
      host: host
    }
  }
  socket.on('connect', () => {
    const latency = Date.now() - startTime;
    socket.destroy();
    ping_replydata.ms = ping_replydata.res.time = latency;
    mainWindow.webContents.send('ping-reply', ping_replydata);
  });

  socket.on('error', (err) => {
    console.error(`[Ping] ${err}`);
    socket.destroy();
  });
}

//TODO: FIX IT!
ipcMain.on('ping', async (event, arg) => {
  // console.log(arg); // 打印消息
  host = arg.host;
  timeout = arg.timeout;
  pingid = arg.pingid;
  Ping(host, timeout, pingid);
});


// 写入配置文件
ipcMain.on('speed_code_config', (event, arg) => {
  logger.debug(`[speed_code_config] ${arg.toString()}`);
  // console.log(arg); // 打印来自渲染进程的消息
  if (arg.mode == "taskkill") {
    KillAllProcess();
    return;
  }
  else if (arg.mode == "socks_startup_check") {
    socks_test("socks_startup_check", "127.0.0.1:16780");
    return;
  }
  else if (arg.mode == "log") {
    //TODO:
    mainWindow.webContents.send('speed_code', { "start": "log", "log": null });
    return;
  }

  // 平台加速host服务
  else if (arg.mode == "sniproxy") {
      const sniproxy_args = [
        '-d', '-c', path.join(localesPath, 'bin\\sniproxy-config.yaml')
      ];
    const sniproxy_exe = execFile(path.join(localesPath, 'bin\\sniproxy.exe'), sniproxy_args);
    // 监听子进程的标准输出数据
    sniproxy_exe.stdout.on('data', (data) => {
      logger.debug(`[sniproxy] ${data}`);
    });
    return;
  }

  // logger.info(`=== Now Starting nf2 === `);
  // 处理nf2配置
  nf2_config = Buffer.from(arg.Game_config.nf2_config, 'base64').toString('utf-8');
  logger.info("nf2cfg", nf2_config);
  const dataArray = nf2_config.split("\n");
  let datagameconfig = "";
  const fileContents = fs.readFileSync('bin\\mihomo\\config\\default.yaml', 'utf8');
  const data = yaml.load(fileContents);
  data.rules = ["PROCESS-NAME,SpeedNet.exe,DIRECT"];
  data.rules.push(`PROCESS-NAME,sniproxy.exe,DIRECT`);
  for (let i = 0; i < dataArray.length; i++) {
    let processName = dataArray[i].replaceAll('\r\n','').replaceAll('\r','');
    data.rules.push(`PROCESS-NAME,${processName},PROXY`);
    datagameconfig = datagameconfig + processName + ",";  // windows 是\r\n linux是 \r
  }
  data.rules.push(`MATCH,DIRECT`);
  const yamlStr = yaml.dump(data);
  fs.writeFileSync('bin\\mihomo\\config\\default.yaml', yamlStr, 'utf8');
  Fox_writeFile(path.join(localesPath, 'bin\\config\\game_config_nf2'), datagameconfig); // 写入nf2配置

  net_config = Buffer.from(arg.Game_config.net_config, 'base64').toString('utf-8');
  const dataArray2 = net_config.split("\n");
  datagameconfig = "";
  for (let i = 0; i < dataArray2.length; i++) {
    datagameconfig = datagameconfig + dataArray2[i].replaceAll('\r\n','').replaceAll('\r','') + ","  // windows 是\r\n linux是 \r
  }
  datagameconfig = datagameconfig + "@" + arg.Server_config.ip

  Fox_writeFile(path.join(localesPath, 'bin\\config\\game_config_wintun'), datagameconfig) // 写入WINTUN配置

  if(arg.code_mod == "gost") {
    ///////////////////////////////////////////////////////////////////////
    // 启动gost网络连接服务
    const gost_args = [
      '-api', '127.114.233.8:17080',
      '-metrics', '127.114.233.8:15088',
      '-L', 'socks5://:16780?udp=true',
      '-F', `${arg.Server_config.connect_mode}://${arg.Server_config.method}:${arg.Server_config.token}@${arg.Server_config.ip}:${arg.Server_config.port}`
    ];

    const gost_exe = execFile(path.join(localesPath, 'bin\\SpeedNet.exe') , gost_args);
    // logger.debug(`gost command: ${gost_command}`);
    // 监听子进程的标准输出数据
    gost_exe.stdout.on('data', (data) => {
      logger.debug(`[SpeedNet gost] ${data}`);
    });

    // 监听子进程的标准错误数据
    gost_exe.stderr.on('data', (data) => {
      logger.warn(`[SpeedNet gost] ${data}`);
    });

    // 监听子进程的关闭事件
    gost_exe.on('close', (code) => {
      logger.error(`[SpeedNet gost] SpeedNet exit code ${code}`); // TODO:?? code 1 手动停止
      // console.log(`[SpeedNet] 意外终止！`);
      mainWindow.webContents.send('speed_code', {"start":"close","Module":"gost_exe"});
    });
  }

  else if (arg.code_mod == "v2ray") {
    Fox_writeFile(path.join(myAppDataPath, 'SpeedNet_V2.json'), arg.v2config); // 写入v2ray配置
    const v2_args = [
      'run', '-c', path.join(myAppDataPath, 'SpeedNet_V2.json')
    ];
    const v2ray_exe = execFile(path.join(localesPath, 'bin\\SpeedNet_V2.exe'), v2_args);

    // 监听子进程的标准输出数据
    v2ray_exe.stdout.on('data', (data) => {
      logger.debug(`[SpeedNet_V2] ${data}`);
    });
  
    // 监听子进程的标准错误数据
    v2ray_exe.stderr.on('data', (data) => {
      logger.warn(`[SpeedNet_V2] ${data}`);
    });
  
    // 监听子进程的关闭事件
    v2ray_exe.on('close', (code) => {
      logger.error(`[SpeedNet_V2] SpeedNet exit code ${code}`);
      mainWindow.webContents.send('speed_code', {"start":"close","Module":"v2ray_exe"});// 发送基座信息给渲染层
    });
  }
  //////////////////////////////////////////////////////////////////////
  // 启动加速模块
  // setTimeout(function(){
    logger.debug(`[SpeedProxy] mode ${arg.mode}`);
    if (arg.mode == "nf2_start") {
      const mihomo_args = [
        '-f', path.join(localesPath, 'bin\\mihomo\\config\\default.yaml'),
        '-d', path.join(localesPath, 'bin\\mihomo')
      ];
      const mihomo = execFile(path.join(localesPath, 'bin\\mihomo\\core.exe'), mihomo_args);
      mihomo.stdout.on('data', (data) => {
        logger.info("from mihomo", data);
      });
      mihomo.stderr.on('data', (data) => {
        logger.info("from mihomo", data);
      });
      mainWindow.webContents.send('speed_code', {"id":"Tunnel_OK"});
    }
    else {
      const SpeedProxy_args = [
        arg.mode.toString()
      ];
  
      const SpeedProxy = execFile(path.join(localesPath, 'bin\\SpeedProxy.exe'), SpeedProxy_args);
      
      // 监听子进程的标准输出数据
      SpeedProxy.stdout.on('data', (data) => {
        if(data.includes('"Bandwidth":{') ){
          // console.log("有流量变化",data);
          mainWindow.webContents.send('proxy_bd_data', data);// 发送基座信息给渲染层
          return
        }
      
        if(data.includes('"code":{') ){
          // console.log("有流量变化",data);
          mainWindow.webContents.send('speed_code', data);// 发送基座信息给渲染层
          return
        }
  
        logger.debug(`[SpeedProxy_cmd_data] ${data}`);
  
        if (data.includes('NF2<====>OK') || data.includes('Route<====>OK') ) {
          logger.info("[SpeedProxy] Core Module Normal");
          mainWindow.webContents.send('speed_code', {"id":"Tunnel_OK"});// 发送基座信息给渲染层
          // socks_test() // SOCKS测试
        }
        if (data.includes('NF2<====>Exit')) {
          console.log("[SpeedProxy] Core Module Exit");
          mainWindow.webContents.send('speed_code', {"start":"close","Module":"SpeedProxy ERROR"});// 发送基座信息给渲染层
        }
      });
    
      // 监听子进程的标准错误数据
      SpeedProxy.stderr.on('data', (data) => {
        logger.warn(`[SpeedProxy] data: ${data}`);
      });
    
      // 监听子进程的关闭事件
      SpeedProxy.on('close', (code) => {
        logger.error(`[SpeedProxy] exit code ${code}`);
      
        // console.log(`[SpeedProxy] Exception!`); // todo 手动推出 code 1
        mainWindow.webContents.send('speed_code', {"start":"close","Module":"SpeedProxy"});// 发送基座信息给渲染层
      });
    }
  // }, 100); //单位是毫秒

});

// 测试启动模块
ipcMain.on('speed_code_test', (event, arg) => {
  const SpeedProxy_test = exec(`"${path.join(localesPath, 'bin\\SpeedProxy.exe')}" nf2_install`);
  
  // 监听子进程的标准输出数据
  SpeedProxy_test.stdout.on('data', (data) => {
    logger.debug(`[SpeedProxy_test] stdout: ${data}`);
    mainWindow.webContents.send('speed_code_test', data);
  });

  SpeedProxy_test.stderr.on('data', (data) => {
    logger.warn(`[SpeedProxy_test] stderr: ${data}`);
    mainWindow.webContents.send('speed_code_test', data);
  });

});

// 开启 开机自启动
ipcMain.on('openAutoStart',()=>{
  app.setLoginItemSettings({
    openAtLogin: true, // 如果用户选择在启动时打开应用，则设置为 true
    openAtLoginOptions: {
      // 写开机启动
      path: `"${app.getPath('exe')}" -workdir="${localesPath}" -silent`
    }
  })
});
// 关闭 开机自启动
ipcMain.on('closeAutoStart',()=>{
  app.setLoginItemSettings({
    openAtLogin: false
  })
})

ipcMain.on('batchAddHostRecords', (event, arg) => {
  batchAddHostRecords(arg, '# Speed Fox');
})

ipcMain.on('batchRemoveHostRecords', (event, arg) => {
  batchRemoveHostRecords('# Speed Fox');
})


// 平台加速
ipcMain.on('host_speed_start', (event, arg) => {
  logger.info(`[host] 平台加速:服务已启动`);

  const gost_args = [
    '-api', '127.114.233.8:18080',
    '-metrics', '127.114.233.8:16088',
    '-L', 'socks5://127.114.233.8:16789?udp=true',
    '-F', arg.f
  ];

  const host_speed_gost_exe = execFile(path.join(localesPath, 'bin\\SpeedNet.exe') , gost_args);

  // 监听子进程的标准输出数据
  host_speed_gost_exe.stdout.on('data', (data) => {
    logger.debug(`[host_speed_start] host speed: ${data}`);
  });
})

ipcMain.on('host_test', (event, arg) => {
  socks_test(arg.tag, arg.server);
})


// 设置优先级
ipcMain.on('high_priority', (event, arg) => { 

  // 要提高优先级的进程名
  const PROCESS_NAME = arg;
  logger.debug('[high_priority] 提升优先级:', PROCESS_NAME);


  // 获取指定进程的 PID
  exec(`tasklist /fi "imagename eq ${PROCESS_NAME}" /fo csv /nh`, (err, stdout, stderr) => {
    if (err) {
      logger.warn(`[high_priority] failed to get pid: ${err}`);
      return;
    }

    // 解析输出，获取 PID
    const lines = stdout.trim().split('\r\n');
    if (lines.length === 0) {
      logger.warn(`[high_priority] process not found: ${PROCESS_NAME}`);
      return;
    }

    logger.warn('提升优先级 - lines ' + lines);

    if(!lines.toString().includes('.exe')){
      logger.warn(`[high_priority] process not found (lines): ${lines}`);
      return;
    }

    const pid = lines[0].split(',')[1].replace(/"/g, '');
    logger.debug(`[high_priority] process: ${PROCESS_NAME} pid: ${pid}`)

    // 提高进程优先级为高
    exec(`wmic process where ProcessId=${pid} call setpriority "high priority"`, (err, stdout, stderr) => {
      if (err) {
        logger.warn(`[high_prioriry] wmic error ${err}`);
        return;
      }

      logger.debug(`[high_prioriry] success ${PROCESS_NAME}`);
    });
  });

});



// 更新的blob TODO:Why not fox_writefile?
ipcMain.on('update_blob', (event, arg) => {
  const dataBuffer = Buffer.from(arg, 'base64');

  fs.writeFile(path.join(myAppDataPath, 'update_.exe'), dataBuffer, (err) => {
    if (err) {
      // 失败
      logger.warn(`[update_blob] ${err}`);
    } else {
      // 成功
      logger.debug('[update_blob] success');
      exec(`"${path.join(myAppDataPath, 'update_.exe')}"  --updated --force-run`);
      // mainWindow.webContents.send('writeFileResult', { success: true, message: 'File written successfully!' });
    }
  });

})

// NET的blob
ipcMain.on('NET_blob', (event, arg) => {
  const dataBuffer = Buffer.from(arg, 'base64');

  fs.writeFile(path.join(myAppDataPath, 'NET_INSTALL_.exe'), dataBuffer, (err) => {
    if (err) {
      // 失败
      logger.warn(`[NET_blob] ${err}`);
    } else {
      // 成功
      logger.debug('[update_blob] success');
      exec(`"${path.join(myAppDataPath, 'NET_INSTALL_.exe')}" /q /norestart`);
      // mainWindow.webContents.send('writeFileResult', { success: true, message: 'File written successfully!' });
    }
  });

})


// 获取网页上的log
ipcMain.on('web_log', (event, arg) => {
  logger.debug('[UI_log] ' + arg);
});


ipcMain.on('user_get_exe', (event, arg) => {
  dialog.showOpenDialog( {
    properties: ['openFile'],
    title:'请选择游戏路径',
    filters:[    //过滤文件类型
      { name: '游戏主程序', extensions: ['exe','url'] },
    ]
  }).then(result => {
    mainWindow.webContents.send('selected-file', result.filePaths);// 发送基座信息给渲染层

  }).catch(err => {
    logger.error(`[user_get_exe] dialog ${err}`)
  })
});

ipcMain.on('user_start_exe', (event, arg) => {
  // 启动一个独立的子进程来运行快捷方式
  const child = spawn('cmd.exe', ['/c', 'start', '', arg], {
    detached: true,
    stdio: 'ignore'
  });

  // 让父进程不再等待子进程的退出
  child.unref();
});

ipcMain.on('openurl', (event, arg) => {
  // for some unknown reason it can't be exposed?
  shell.openExternal(arg);
});

ipcMain.on('test_baidu', (event, arg) => {
  // 启动一个独立的子进程来运行快捷方式
  const child = spawn('cmd.exe', ['/c', "ping www.baidu.com -t"], {
    detached: true,
    stdio: 'ignore'
  });

  // 让父进程不再等待子进程的退出
  child.unref();
});



ipcMain.on('speed_code_config_exe', (event, arg) => {
  logger.debug(`[SpeedProxy] mode ${arg.mode}`);
  const speed_code_config_exe = exec(`"${path.join(localesPath, 'bin\\SpeedProxy.exe')}" ${arg}`);
  
  // 监听子进程的标准输出数据
  speed_code_config_exe.stdout.on('data', (data) => {
    logger.debug(`[speed_code_config_exe] ${data}`);
  })
});





ipcMain.on('socks_connect_test', (event, arg) => {
  const brook = exec(`"${path.join(localesPath, 'bin\\SpeedNet_brook.exe')}" testsocks5 -s 127.0.0.1:16780`);

 // 监听子进程的标准输出数据
  brook.stdout.on('data', (data) => {
    logger.debug(`[socks_connect_test] : ${data}`);
    mainWindow.webContents.send('socks_connect_test', data);// 发送基座信息给渲染层
  });

  brook.stderr.on('data', (data) => {
    logger.warn(`[socks_connect_test] ${data}`);
    mainWindow.webContents.send('socks_connect_test', data);// 发送基座信息给渲染层
  });
});


ipcMain.on('startSpeed', (event, arg) => {
  let nf2_config = Buffer.from(arg.Game_config.nf2_config, 'base64').toString('utf-8');
  logger.info("nf2cfg", nf2_config);
  const speedProcesses = nf2_config.split("\n");
  let nf2Cfg = "";
  const mihomoCfgFilePath = path.join(localesPath, "bin\\mihomo\\config\\default.yaml");
  const mihomoCfgFile = yaml.load(
    fs.readFileSync(
      'bin\\mihomo\\config\\default.yaml', 'utf8')
  );
  mihomoCfgFile.rules = ["PROCESS-NAME,SpeedNet.exe,DIRECT"];
  mihomoCfgFile.rules.push('PROCESS-NAME,sniproxy.exe,DIRECT');
  for (let i = 0; i < speedProcesses.length; i++) {
    let processName = speedProcesses[i].replaceAll('\r\n','').replaceAll('\r','');
    mihomoCfgFile.rules.push(`PROCESS-NAME,${processName},PROXY`);
    nf2Cfg = nf2Cfg + processName + ",";
  }
  mihomoCfgFile.rules.push(`MATCH,DIRECT`);
  const ModMihomoCfg = yaml.dump(mihomoCfgFile);
  fs.writeFileSync(path.join(app.getPath('userData'), "mihomo\\config\\the.yaml"), ModMihomoCfg, 'utf8');
  Fox_writeFile(path.join(localesPath, 'bin\\config\\game_config_nf2'), nf2Cfg);

  let wintunCfg = Buffer.from(arg.Game_config.net_config, 'base64').toString('utf-8');
  const SpeedIPRange = wintunCfg.split("\n");
  nf2Cfg = "";
  for (let i = 0; i < SpeedIPRange.length; i++) {
    nf2Cfg = nf2Cfg + SpeedIPRange[i].replaceAll('\r\n','').replaceAll('\r','') + ",";
  }
  nf2Cfg = nf2Cfg + "@" + arg.Server_config.ip;

  Fox_writeFile(path.join(localesPath, 'bin\\config\\game_config_wintun'), nf2Cfg);
  if (arg.core_type == "gost") {
    ///////////////////////////////////////////////////////////////////////
    // 启动gost网络连接服务
    const gost_args = [
      '-api', '127.114.233.8:17080',
      '-metrics', '127.114.233.8:15088',
      '-L', 'socks5://:16780?udp=true',
      '-F', `${arg.Server_config.connect_mode}://${arg.Server_config.method}:${arg.Server_config.token}@${arg.Server_config.ip}:${arg.Server_config.port}`
    ];

    const gost_exe = execFile(path.join(localesPath, 'bin\\SpeedNet.exe') , gost_args);
    gost_exe.stdout.on('data', (data) => {
      logger.debug(`[gost socks5] ${data}`);
    });
    gost_exe.stderr.on('data', (data) => {
      logger.warn(`[gost socks5] ${data}`);
    });
    gost_exe.on('close', (code) => {
      logger.error(`[gost socks5] SpeedNet exit code ${code}`); // TODO:?? code 1 手动停止
      mainWindow.webContents.send('speed_code', {"start":"close","Module":"gost_exe"});
    });
  }
  else if (arg.code_mod == "v2ray") {
    Fox_writeFile(path.join(myAppDataPath, 'SpeedNet_V2.json'), arg.v2config); // 写入v2ray配置
    const v2_args = [
      'run', '-c', path.join(myAppDataPath, 'SpeedNet_V2.json')
    ];
    const v2ray_exe = execFile(path.join(localesPath, 'bin\\SpeedNet_V2.exe'), v2_args);
    v2ray_exe.stdout.on('data', (data) => {
      logger.debug(`[SpeedNet_V2] ${data}`);
    });
    v2ray_exe.stderr.on('data', (data) => {
      logger.warn(`[SpeedNet_V2] ${data}`);
    });
    v2ray_exe.on('close', (code) => {
      logger.error(`[SpeedNet_V2] SpeedNet exit code ${code}`);
      mainWindow.webContents.send('speed_code', {"start":"close","Module":"v2ray_exe"});// 发送基座信息给渲染层
    });
  }
  if (arg.mode == "nf2_start") {
    const mihomo_args = [
      '-f', path.join(app.getPath('userData'), "mihomo\\config\\the.yaml"),
      '-d', path.join(app.getPath('userData'), 'mihomo')
    ];
    const mihomo = execFile(path.join(localesPath, 'bin\\mihomo\\core.exe'), mihomo_args);
    mainWindow.webContents.send('speed_code', {"id":"Tunnel_OK"});
  } else {
    const SpeedProxy_args = [
      arg.mode.toString()
    ];

    const SpeedProxy = execFile(path.join(localesPath, 'bin\\SpeedProxy.exe'), SpeedProxy_args);
    
    // 监听子进程的标准输出数据
    SpeedProxy.stdout.on('data', (data) => {
      if(data.includes('"Bandwidth":{') ){
        // console.log("有流量变化",data);
        mainWindow.webContents.send('proxy_bd_data', data);// 发送基座信息给渲染层
        return
      }
    
      if(data.includes('"code":{') ){
        // console.log("有流量变化",data);
        mainWindow.webContents.send('speed_code', data);// 发送基座信息给渲染层
        return
      }

      logger.debug(`[SpeedProxy_cmd_data] ${data}`);

      if (data.includes('NF2<====>OK') || data.includes('Route<====>OK') ) {
        logger.info("[SpeedProxy] Core Module Normal");
        mainWindow.webContents.send('speed_code', {"id":"Tunnel_OK"});// 发送基座信息给渲染层
        // socks_test() // SOCKS测试
      }
      if (data.includes('NF2<====>Exit')) {
        console.log("[SpeedProxy] Core Module Exit");
        mainWindow.webContents.send('speed_code', {"start":"close","Module":"SpeedProxy ERROR"});// 发送基座信息给渲染层
      }
    });
  
    // 监听子进程的标准错误数据
    SpeedProxy.stderr.on('data', (data) => {
      logger.warn(`[SpeedProxy] data: ${data}`);
    });
  
    // 监听子进程的关闭事件
    SpeedProxy.on('close', (code) => {
      logger.error(`[SpeedProxy] exit code ${code}`);
    
      // console.log(`[SpeedProxy] Exception!`); // todo 手动推出 code 1
      mainWindow.webContents.send('speed_code', {"start":"close","Module":"SpeedProxy"});// 发送基座信息给渲染层
    });
  }
});
