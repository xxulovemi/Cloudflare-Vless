import { connect } from 'cloudflare:sockets';

const 小魔法颜色表 = Array.from({ length: 256 }, (_, i) => (i + 256).toString(16).slice(1));
const 小可爱文字解码器 = new TextDecoder();

const 我的小甜甜身份证 = '88888888-8888-8888-8888-888888888888';  //更改成你的UUID
const 默认备用小可爱地址 = 'usip.vpndns.net';  //更改成你的落地IP

const 桥梁缓冲水位 = 2 * 1024 * 1024;
const 发送缓冲水位 = 2 * 1024 * 1024;
const 直连超时毫秒 = 5000;
const 合包最大字节 = 512 * 1024;
const 合包最大等待 = 20;  //调节此值可降低网络延迟，但是牺牲吞吐量，在意网络延迟的话建议改成5

export default {
  async fetch(来自外面的请求) {
    const 握手头 = 来自外面的请求.headers.get('Upgrade');
    const 网址 = new URL(来自外面的请求.url);

    if (握手头 && 握手头.toLowerCase() === 'websocket') {
      let 候选地址 = 默认备用小可爱地址;

      if (网址.searchParams.has('ip')) {
        候选地址 = 网址.searchParams.get('ip');
      } else {
        const 提取路径IP = 网址.pathname.match(/^\\/ip=([^&]+)/);
        if (提取路径IP) {
          候选地址 = decodeURIComponent(提取路径IP[1]);
          return await 升级成小可爱通道(候选地址);
        }
      }
      return await 升级成小可爱通道(候选地址);
    }
    return new Response(null);
  },
};

async function 升级成小可爱通道(当前备用地址) {
  const 泡泡对 = new WebSocketPair();
  const [小甜甜端, 服务端] = Object.values(泡泡对);
  服务端.accept();
  服务端.send(new Uint8Array([0, 0]));
  开启数据小火车(服务端, 当前备用地址).catch(() => {});
  return new Response(null, { status: 101, webSocket: 小甜甜端 });
}

async function 开启数据小火车(服务端, 当前备用地址) {
  let 小火车TCP通道;
  let 是第一个糖果包 = true;
  let 已经关门了 = false;
  let 排队小助手 = Promise.resolve();

  const ts桥梁 = new TransformStream(
    {},
    new ByteLengthQueuingStrategy({ highWaterMark: 桥梁缓冲水位 }),
    new ByteLengthQueuingStrategy({ highWaterMark: 桥梁缓冲水位 }),
  );
  const 桥梁写入端 = ts桥梁.writable.getWriter();

  function 关门谢客(代码 = 1011, 原因 = '再见啦', WS已先关闭 = false) {
    if (已经关门了) return;
    已经关门了 = true;
    if (!WS已先关闭) {
      try { 服务端.close(代码, 原因); } catch {}
    }
    桥梁写入端.close().catch(() => {});
    try { 小火车TCP通道?.close?.(); } catch {}
  }

  服务端.addEventListener('close', () => 关门谢客(1000, '客户端挥手再见', true));
  服务端.addEventListener('error', () => 关门谢客(1011, 'WS出错啦', true));

  服务端.addEventListener('message', (事件) => {
    if (已经关门了) return;
    排队小助手 = 排队小助手.then(async () => {
      if (已经关门了) return;
      if (是第一个糖果包) {
        是第一个糖果包 = false;
        await 解读第一个糖果包(事件.data);
      } else {
        await 桥梁写入端.write(事件.data);
      }
    }).catch(() => 关门谢客(1011, '糖果包处理失败'));
  });

  async function 解读第一个糖果包(糖果数据) {
    const 视图 = new DataView(糖果数据);

    if (把字节变成身份证号(视图, 1) !== 我的小甜甜身份证) {
      关门谢客(1008, '身份证不对哦');
      return;
    }

    const 附加长度 = 视图.getUint8(17);
    const 端口起始位 = 18 + 附加长度 + 1;
    const 目标端口 = 视图.getUint16(端口起始位);
    const 地址类型起始位 = 端口起始位 + 2;
    const 地址类型 = 视图.getUint8(地址类型起始位);

    let 地址字节长度 = 0;
    let 目标地址 = '';
    let 地址数据起始位 = 地址类型起始位 + 1;

    switch (地址类型) {
      case 1:
        地址字节长度 = 4;
        目标地址 = `${视图.getUint8(地址数据起始位)}.${视图.getUint8(地址数据起始位+1)}.${视图.getUint8(地址数据起始位+2)}.${视图.getUint8(地址数据起始位+3)}`;
        break;
      case 2:
        地址字节长度 = 视图.getUint8(地址数据起始位);
        地址数据起始位 += 1;
        目标地址 = 小可爱文字解码器.decode(new Uint8Array(糖果数据, 地址数据起始位, 地址字节长度));
        break;
      case 3:
        地址字节长度 = 16;
        目标地址 = Array.from(
          { length: 8 },
          (_, i) => 视图.getUint16(地址数据起始位 + i * 2).toString(16)
        ).join(':');
        break;
      default:
        关门谢客(1008, '不认识的地址类型');
        return;
    }

    const 首包剩余数据 = 糖果数据.slice(地址数据起始位 + 地址字节长度);

    try {
      小火车TCP通道 = await 带超时的连接(目标地址, 目标端口);
    } catch {
      try {
        const { 备用主机, 备用端口 } = 拆分地址和端口(当前备用地址, 目标端口);
        小火车TCP通道 = connect({ hostname: 备用主机, port: 备用端口 });
      } catch {
        关门谢客(1011, '所有路都堵死啦');
        return;
      }
    }

    连上之后开始传数据(首包剩余数据).catch(() => {});
  }

  async function 连上之后开始传数据(首包剩余数据) {
    if (首包剩余数据?.byteLength > 0) {
      await 桥梁写入端.write(首包剩余数据);
    }

    await Promise.all([
      ts桥梁.readable.pipeTo(小火车TCP通道.writable).catch(() => {
        关门谢客(1011, '桥梁→TCP中断');
      }),
      小火车TCP通道.readable.pipeTo(
        合包发送流(服务端, 合包最大字节, 合包最大等待)
      ).catch(() => {
        关门谢客(1011, 'TCP→WS异常');
      }),
    ]);
  }
}

function 合包发送流(服务端, 最大字节, 最大等待ms) {
  let 积累缓冲 = [];
  let 积累字节数 = 0;
  let 定时器 = null;
  let 正在发送 = false;
  let 等待发送的resolve = null;

  function 立刻发出去() {
    if (定时器) { clearTimeout(定时器); 定时器 = null; }
    if (积累缓冲.length === 0) return;
    if (服务端.readyState !== WebSocket.OPEN) {
      积累缓冲 = [];
      积累字节数 = 0;
      return;
    }

    const 合并包 = new Uint8Array(积累字节数);
    let 写入位置 = 0;
    for (const 块 of 积累缓冲) {
      const 视图块 = ArrayBuffer.isView(块)
        ? new Uint8Array(块.buffer, 块.byteOffset, 块.byteLength)
        : new Uint8Array(块);
      合并包.set(视图块, 写入位置);
      写入位置 += 视图块.byteLength;
    }

    积累缓冲 = [];
    积累字节数 = 0;
    正在发送 = true;
    try {
      服务端.send(合并包);
    } finally {
      正在发送 = false;
      if (等待发送的resolve) {
        等待发送的resolve();
        等待发送的resolve = null;
      }
    }
  }

  return new WritableStream({
    async write(chunk) {
      if (正在发送) {
        await new Promise(resolve => { 等待发送的resolve = resolve; });
      }

      积累缓冲.push(chunk);
      积累字节数 += chunk.byteLength;

      if (积累字节数 >= 发送缓冲水位) {
        立刻发出去();
        if (正在发送) {
          await new Promise(resolve => { 等待发送的resolve = resolve; });
        }
        return;
      }

      if (积累字节数 >= 最大字节) {
        立刻发出去();
      } else if (!定时器) {
        定时器 = setTimeout(立刻发出去, 最大等待ms);
      }
    },

    async flush() {
      if (正在发送) {
        await new Promise(resolve => { 等待发送的resolve = resolve; });
      }
      立刻发出去();
    },

    async abort() {
      if (定时器) { clearTimeout(定时器); 定时器 = null; }
      积累缓冲 = [];
      积累字节数 = 0;
    },
  }, new ByteLengthQueuingStrategy({ highWaterMark: 发送缓冲水位 }));
}

function 拆分地址和端口(地址字符串, 默认端口) {
  function 校验端口(端口) {
    return Number.isInteger(端口) && 端口 >= 1 && 端口 <= 65535 ? 端口 : 默认端口;
  }

  if (地址字符串.startsWith('[')) {
    const 括号结束 = 地址字符串.indexOf(']');
    const 备用主机 = 地址字符串.slice(0, 括号结束 + 1);
    const 后缀 = 地址字符串.slice(括号结束 + 1);
    return {
      备用主机,
      备用端口: 校验端口(后缀.startsWith(':') ? Number(后缀.slice(1)) : 默认端口),
    };
  }

  const 冒号位 = 地址字符串.lastIndexOf(':');
  if (冒号位 === -1) return { 备用主机: 地址字符串, 备用端口: 默认端口 };
  return {
    备用主机: 地址字符串.slice(0, 冒号位),
    备用端口: 校验端口(Number(地址字符串.slice(冒号位 + 1))),
  };
}

function 把字节变成身份证号(视图, offset = 0) {
  const h = 小魔法颜色表;
  return (
    h[视图.getUint8(offset)] + h[视图.getUint8(offset+1)] +
    h[视图.getUint8(offset+2)] + h[视图.getUint8(offset+3)] + '-' +
    h[视图.getUint8(offset+4)] + h[视图.getUint8(offset+5)] + '-' +
    h[视图.getUint8(offset+6)] + h[视图.getUint8(offset+7)] + '-' +
    h[视图.getUint8(offset+8)] + h[视图.getUint8(offset+9)] + '-' +
    h[视图.getUint8(offset+10)] + h[视图.getUint8(offset+11)] +
    h[视图.getUint8(offset+12)] + h[视图.getUint8(offset+13)] +
    h[视图.getUint8(offset+14)] + h[视图.getUint8(offset+15)]
  ).toLowerCase();
}

async function 带超时的连接(主机, 端口) {
  let 炸弹定时器;
  const 通道 = connect({ hostname: 主机, port: 端口 });
  const 超时炸弹 = new Promise((_, reject) => {
    炸弹定时器 = setTimeout(() => reject(new Error('连接超时')), 直连超时毫秒);
  });
  try {
    await Promise.race([通道.opened, 超时炸弹]);
    return 通道;
  } catch (错误) {
    try { 通道.close(); } catch {}
    throw 错误;
  } finally {
    clearTimeout(炸弹定时器);
  }
}
