import { connect } from 'cloudflare:sockets';

const 小可爱文字解码器 = new TextDecoder('utf-8', { fatal: true });
const 关门原因编码器 = new TextEncoder();
const 关门原因解码器 = new TextDecoder();
const 我的小甜甜身份证 = '88888888-8888-8888-8888-888888888888';  //修改为你的UUID
const 身份证字节 = ((uuid) => {
  const hex = uuid.replace(/-/g, '');
  const arr = new Uint8Array(16);
  for (let i = 0; i < 16; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
})(我的小甜甜身份证);
const 默认备用小可爱地址 = 'usip.vpndns.net';  //修改为你的落地IP

// ═══════════════════════════════════════════════════════════════════
// ⚙️ 可调参数（千兆网络，二选一，默认启用【预设B：千兆日常】）
// ═══════════════════════════════════════════════════════════════════

// ── 合包策略 ────────────────────────────────────────────────────
//   合包最大字节：合包发送流的背压水位（字节）。控制 pipeTo 向此流写入的速率上限，
//     同时是单帧载荷的软上限（TCP chunk 通常远小于此值）。越大吞吐越高但内存峰值越高。
//     CF Workers 单 WS 帧硬上限约 1MB，建议不超过 512KB。
//   合包刷新阈值：缓冲积累到该字节数时立即发出，无需等待定时器。
//     建议设为 合包最大字节 的 75%，在吞吐和延迟间取得平衡。
//   合包最大等待：定时器兜底刷新间隔（毫秒）。未到阈值时超过此时间强制发出，
//     防止小流量场景数据积压。高吞吐场景调大，低延迟场景调小。

// 【预设A：千兆高压】适合峰值突发、大文件批量传输、高吞吐优先场景
//   每连接内存上限约 8MB，128MB Workers 配额支撑约 16 个满载并发。
// const 合包最大字节 = 512 * 1024;   // 512KB
// const 合包刷新阈值 = 384 * 1024;   // 384KB（合包最大字节 × 75%）
// const 合包最大等待 = 16;            // 16ms（满载时阈值路径主导，定时器极少触发）
// const 桥梁缓冲水位 = 8 * 1024 * 1024;  // 8MB（覆盖 16MB TCP 窗口的 50%）
// const 主连接超时毫秒 = 1500;   // 主连接最长等待 1.5s
// const 备用连接超时毫秒 = 3000; // 备用连接最长等待 3s（总上限 4.5s）
// const 背压最大退避毫秒 = 32;   // 32ms（大块传输，等待 GC 有价值）

// 【预设B：千兆日常】适合稳定并发、混合流量、高连接数优先场景（当前启用）
//   每连接内存上限约 4MB，128MB Workers 配额支撑约 32 个满载并发。
//   合包等待 8ms 兼顾延迟与吞吐，备用超时 4s 容忍网络抖动。
const 合包最大字节 = 256 * 1024;   // 256KB
const 合包刷新阈值 = 192 * 1024;   // 192KB（合包最大字节 × 75%）
const 合包最大等待 = 8;             // 8ms（低流量响应延迟比 10ms 降低 20%）
const 桥梁缓冲水位 = 4 * 1024 * 1024;  // 4MB（覆盖常见 TCP 窗口上限）
const 主连接超时毫秒 = 2000;   // 主连接最长等待 2s
const 备用连接超时毫秒 = 4000; // 备用连接最长等待 4s（总上限 6s，容忍较差网络）
const 背压最大退避毫秒 = 16;   // 16ms（混合流量平衡 GC 压力与响应速度）

// ── 消息队列溢出保护 ─────────────────────────────────────────────
// 双重上限：条数防小帧洪水，字节上限是主要安全阀（实际受 TCP 窗口约束）。
// 512条 × 最大帧 64KB = 32MB，仍在 64MB 字节上限内；正常使用极少超过 50 条。
const 消息队列条数上限 = 512;
const 消息队列字节上限 = 64 * 1024 * 1024;  // 64MB（两套预设通用）

// ═══════════════════════════════════════════════════════════════════


const 地址合法正则 = /^[a-zA-Z0-9._\-:\[\]]+$/;
const 路径IP正则 = /^\/ip=([^&\/]+)/;
const 握手确认包 = new Uint8Array([0, 0]);

function 截断关门原因(原因) {
  if (原因.length * 3 <= 123) return 原因;
  const encoded = 关门原因编码器.encode(原因);
  if (encoded.byteLength <= 123) return 原因;
  let len = 123;
  while (len > 0 && (encoded[len] & 0xc0) === 0x80) len--;
  return 关门原因解码器.decode(encoded.subarray(0, len));
}

function 校验候选地址(候选地址) {
  if (
    候选地址.length === 0 ||
    候选地址.length > 253 ||
    候选地址 === '.' ||
    候选地址 === '[]' ||
    候选地址 === '..' ||
    候选地址.startsWith('./') ||
    候选地址.startsWith('../') ||
    候选地址.startsWith(':') ||
    !地址合法正则.test(候选地址)
  ) {
    return 默认备用小可爱地址;
  }
  return 候选地址;
}

export default {
  async fetch(来自外面的请求) {
    const 握手头 = 来自外面的请求.headers.get('Upgrade');
    if (握手头 && (握手头 === 'websocket' || 握手头.toLowerCase() === 'websocket')) {
      const 网址 = new URL(来自外面的请求.url);
      let 候选地址 = 默认备用小可爱地址;
      if (网址.searchParams.has('ip')) {
        候选地址 = 网址.searchParams.get('ip');
      } else {
        const 提取路径IP = 网址.pathname.match(路径IP正则);
        if (提取路径IP) {
          候选地址 = decodeURIComponent(提取路径IP[1]);
        }
      }
      return 升级成小可爱通道(校验候选地址(候选地址));
    }
    return new Response('Not Found', { status: 404 });
  },
};

function 升级成小可爱通道(当前备用地址) {
  const 泡泡对 = new WebSocketPair();
  const 小甜甜端 = 泡泡对[0];
  const 服务端 = 泡泡对[1];
  服务端.accept();
  try { 服务端.send(握手确认包); } catch {}
  开启数据小火车(服务端, 当前备用地址).catch((e) => { console.error('[小火车]', e); });
  return new Response(null, { status: 101, webSocket: 小甜甜端 });
}

async function 开启数据小火车(服务端, 当前备用地址) {
  let 小火车TCP通道;
  let 已经关门了 = false;

  let 流控制器;
  const ws可读流 = new ReadableStream(
    {
      start(c) { 流控制器 = c; },
      cancel(reason) {
        关门谢客(1011, reason?.message ?? 'stream cancelled');
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: 桥梁缓冲水位 }),
  );

  let 启动传输的信号;
  let 启动失败的信号;
  const 等待启动信号 = new Promise((resolve, reject) => {
    启动传输的信号 = resolve;
    启动失败的信号 = reject;
  });

  let 中止控制器 = null;

  function 关门谢客(代码 = 1011, 原因 = '再见啦', WS已先关闭 = false) {
    if (已经关门了) return;
    已经关门了 = true;
    if (!WS已先关闭) {
      try { 服务端.close(代码, 截断关门原因(原因)); } catch {}
    }
    if (代码 === 1000) {
      try { 流控制器?.close(); } catch {}
      try { 启动失败的信号?.(new Error(原因)); } catch {}
    } else {
      const 关门错误 = new Error(原因);
      try { 流控制器?.error(关门错误); } catch {}
      try { 启动失败的信号?.(关门错误); } catch {}
    }
    try { 中止控制器?.abort(); } catch {}
    try { 小火车TCP通道?.close?.(); } catch {}
  }

  async function 带超时的连接(主机, 端口, 超时ms) {
    if (已经关门了) throw new Error('已关门');
    let 炸弹定时器;
    const 通道 = connect({ hostname: 主机, port: 端口 });
    通道.opened.catch(() => {});
    const 超时炸弹 = new Promise((_, reject) => {
      炸弹定时器 = setTimeout(() => reject(new Error('连接超时')), 超时ms);
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

  服务端.addEventListener('close', () => 关门谢客(1000, '客户端挥手再见', true));
  服务端.addEventListener('error', () => 关门谢客(1011, 'WS出错啦', true));

  let 是第一个糖果包 = true;
  let 正在处理消息 = false;
  const 消息待办队列 = [];
  let 消息队列当前字节 = 0;
  let 消息队列读指针 = 0;

  服务端.addEventListener('message', (事件) => {
    if (已经关门了) return;
    if (typeof 事件.data === 'string') { 关门谢客(1008, '不支持文本帧'); return; }

    const 帧字节 = 事件.data.byteLength;
    if (
      消息待办队列.length >= 消息队列条数上限 ||
      消息队列当前字节 + 帧字节 > 消息队列字节上限
    ) {
      关门谢客(1011, '消息队列溢出');
      return;
    }

    消息待办队列.push(事件.data instanceof ArrayBuffer ? new Uint8Array(事件.data) : 事件.data);
    消息队列当前字节 += 帧字节;

    if (!正在处理消息) {
      正在处理消息 = true;
      (async () => {
        let 退避ms = 1;
        while (消息队列读指针 < 消息待办队列.length) {
          if (已经关门了) break;
          const 当前数据 = 消息待办队列[消息队列读指针++];
          消息队列当前字节 = Math.max(0, 消息队列当前字节 - 当前数据.byteLength);
          if (消息队列读指针 >= 64) {
            // splice 在同步路径执行（此处无 await），queue.length 缩短后 readPtr 归 0，逻辑正确。
            消息待办队列.splice(0, 消息队列读指针);
            消息队列读指针 = 0;
          }

          try {
            if (是第一个糖果包) {
              是第一个糖果包 = false;
              await 解读第一个糖果包(当前数据);
            } else {
              while (流控制器.desiredSize !== null && 流控制器.desiredSize <= 0) {
                if (已经关门了) break;
                await new Promise((r) => setTimeout(r, 退避ms));
                退避ms = Math.min(退避ms * 2, 背压最大退避毫秒);
              }
              退避ms = 1;
              if (已经关门了) break;

              try {
                流控制器.enqueue(当前数据);
              } catch {
                关门谢客(1011, '流已关闭');
                break;
              }
            }
          } catch {
            if (!已经关门了) 关门谢客(1011, '糖果包处理失败');
            break;
          }
        }
        消息待办队列.length = 0;
        消息队列读指针 = 0;
        正在处理消息 = false;
      })().catch(() => {
        正在处理消息 = false;
        if (!已经关门了) 关门谢客(1011, '消息队列崩溃');
      });
    }
  });

  async function 解读第一个糖果包(糖果数据) {
    const 缓冲区 = 糖果数据.buffer;
    const 视图偏移 = 糖果数据.byteOffset;
    const 有效长度 = 糖果数据.byteLength;
    const 视图 = new DataView(缓冲区, 视图偏移, 有效长度);

    if (有效长度 < 24) { 关门谢客(1008, '糖果包太短了'); return; }

    if (!身份证匹配(视图, 1)) {
      关门谢客(1008, '身份证不对哦');
      return;
    }

    const 附加长度 = 视图.getUint8(17);
    const cmd字节位 = 18 + 附加长度;
    if (cmd字节位 >= 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }

    const cmd = 视图.getUint8(cmd字节位);
    if (cmd !== 1) { 关门谢客(1008, '不支持的指令类型'); return; }
    const 端口起始位 = cmd字节位 + 1;
    if (端口起始位 + 2 > 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }

    const 目标端口 = 视图.getUint16(端口起始位);
    if (目标端口 === 0) { 关门谢客(1008, '端口不合法'); return; }

    const 地址类型起始位 = 端口起始位 + 2;
    if (地址类型起始位 >= 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }
    const 地址类型 = 视图.getUint8(地址类型起始位);

    let 地址字节长度 = 0;
    let 目标地址 = '';
    let 地址数据起始位 = 地址类型起始位 + 1;

    switch (地址类型) {
      case 1: // IPv4
        if (地址数据起始位 + 4 > 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }
        地址字节长度 = 4;
        目标地址 = `${视图.getUint8(地址数据起始位)}.${视图.getUint8(地址数据起始位 + 1)}.${视图.getUint8(地址数据起始位 + 2)}.${视图.getUint8(地址数据起始位 + 3)}`;
        break;
      case 2: // 域名
        if (地址数据起始位 >= 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }
        地址字节长度 = 视图.getUint8(地址数据起始位);
        if (地址字节长度 === 0) { 关门谢客(1008, '地址为空'); return; }
        if (地址字节长度 > 253) { 关门谢客(1008, '域名过长'); return; }
        地址数据起始位 += 1;
        if (地址数据起始位 + 地址字节长度 > 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }
        目标地址 = 小可爱文字解码器.decode(
          new Uint8Array(缓冲区, 视图偏移 + 地址数据起始位, 地址字节长度)
        );
        break;
      case 3: // IPv6
        if (地址数据起始位 + 16 > 有效长度) { 关门谢客(1008, '糖果包太短了'); return; }
        地址字节长度 = 16;
        {
          const b = 地址数据起始位;
          目标地址 =
            视图.getUint16(b).toString(16)      + ':' +
            视图.getUint16(b + 2).toString(16)  + ':' +
            视图.getUint16(b + 4).toString(16)  + ':' +
            视图.getUint16(b + 6).toString(16)  + ':' +
            视图.getUint16(b + 8).toString(16)  + ':' +
            视图.getUint16(b + 10).toString(16) + ':' +
            视图.getUint16(b + 12).toString(16) + ':' +
            视图.getUint16(b + 14).toString(16);
        }
        break;
      default:
        关门谢客(1008, '不认识的地址类型');
        return;
    }

    const 数据负载起始 = 地址数据起始位 + 地址字节长度;
    if (数据负载起始 > 有效长度) { 关门谢客(1008, '地址段越界'); return; }

    const 首包剩余长度 = 有效长度 - 数据负载起始;

    try {
      const 临时通道 = await 带超时的连接(目标地址, 目标端口, 主连接超时毫秒);
      if (已经关门了) { try { 临时通道.close(); } catch {} return; }
      小火车TCP通道 = 临时通道;
    } catch {
      try {
        const { 备用主机, 备用端口 } = 拆分地址和端口(当前备用地址, 目标端口);
        if (!备用主机) { 关门谢客(1011, '备用地址主机为空'); return; }
        const 临时通道 = await 带超时的连接(备用主机, 备用端口, 备用连接超时毫秒);
        if (已经关门了) { try { 临时通道.close(); } catch {} return; }
        小火车TCP通道 = 临时通道;
      } catch {
        关门谢客(1011, '所有路都堵死啦');
        return;
      }
    }

    if (已经关门了) return;
    if (首包剩余长度 > 0) {
      try { 流控制器.enqueue(new Uint8Array(缓冲区, 视图偏移 + 数据负载起始, 首包剩余长度).slice()); } catch {}
    }
    启动传输的信号();
  }

  try {
    await 等待启动信号;
  } catch {
    return;
  }
  if (已经关门了) return;

  启动失败的信号 = null;

  中止控制器 = new AbortController();
  const { signal: 中止信号 } = 中止控制器;

  await Promise.all([
    ws可读流.pipeTo(小火车TCP通道.writable, { signal: 中止信号 }).catch((e) => {
      if (e?.name !== 'AbortError') 关门谢客(1011, '桥梁→TCP中断');
    }),
    小火车TCP通道.readable.pipeTo(
      合包发送流(服务端, 合包最大字节, 合包刷新阈值, 合包最大等待),
      { signal: 中止信号 },
    ).catch((e) => {
      if (e?.name !== 'AbortError') 关门谢客(1011, 'TCP→WS异常');
    }),
  ]).catch(() => {});

  if (!已经关门了) 关门谢客(1000, '传输完成');
}

function 合包发送流(服务端, 最大字节, 刷新阈值, 最大等待ms) {
  const 积累缓冲 = [];
  let 积累字节数 = 0;
  let 定时器 = null;
  let 复用缓冲区 = new Uint8Array(最大字节);

  function 立刻发出去() {
    if (定时器) { clearTimeout(定时器); 定时器 = null; }
    if (积累缓冲.length === 0) return;
    if (服务端.readyState !== 1) { 积累缓冲.length = 0; 积累字节数 = 0; return; }
    let 合并包;
    if (积累缓冲.length === 1) {
      合并包 = 积累缓冲[0];
    } else {
      if (积累字节数 > 复用缓冲区.byteLength) {
        复用缓冲区 = new Uint8Array(积累字节数);
      }
      let 写入位置 = 0;
      for (const 块 of 积累缓冲) {
        复用缓冲区.set(块, 写入位置);
        写入位置 += 块.byteLength;
      }
      // 复用缓冲区是共享内存视图，send() 后下次 write 会覆盖同一 ArrayBuffer。
      // CF Workers WS.send(TypedArray) 不保证同步深拷贝，必须 slice() 截取独立副本。
      // 单块路径的 合并包 本身是独立对象（来自 TCP chunk），无需 slice。
      合并包 = 复用缓冲区.subarray(0, 积累字节数).slice();
    }
    积累缓冲.length = 0;
    积累字节数 = 0;
    try { 服务端.send(合并包); } catch {}
  }

  return new WritableStream(
    {
      write(chunk) {
        积累缓冲.push(chunk);
        积累字节数 += chunk.byteLength;
        if (积累字节数 >= 刷新阈值) {
          立刻发出去();
        } else if (!定时器) {
          定时器 = setTimeout(立刻发出去, 最大等待ms);
        }
      },
      flush() {
        立刻发出去();
      },
      abort() {
        if (定时器) { clearTimeout(定时器); 定时器 = null; }
        积累缓冲.length = 0;
        积累字节数 = 0;
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: 最大字节 }),
  );
}

function 拆分地址和端口(地址字符串, 默认端口) {
  function 校验端口(端口) {
    return Number.isInteger(端口) && 端口 >= 1 && 端口 <= 65535 ? 端口 : 默认端口;
  }
  if (地址字符串.startsWith('[')) {
    const 括号结束 = 地址字符串.indexOf(']');
    if (括号结束 === -1) return { 备用主机: 地址字符串, 备用端口: 默认端口 };
    const 备用主机 = 地址字符串.slice(0, 括号结束 + 1);
    const 后缀 = 地址字符串.slice(括号结束 + 1);
    return {
      备用主机,
      备用端口: 校验端口(后缀.startsWith(':') ? Number(后缀.slice(1)) : 默认端口),
    };
  }
  const 冒号位 = 地址字符串.lastIndexOf(':');
  if (冒号位 === -1) return { 备用主机: 地址字符串, 备用端口: 默认端口 };
  if (地址字符串.indexOf(':') !== 冒号位) return { 备用主机: 地址字符串, 备用端口: 默认端口 };
  return {
    备用主机: 地址字符串.slice(0, 冒号位),
    备用端口: 校验端口(Number(地址字符串.slice(冒号位 + 1))),
  };
}

function 身份证匹配(视图, offset = 0) {
  for (let i = 0; i < 16; i++) {
    if (视图.getUint8(offset + i) !== 身份证字节[i]) return false;
  }
  return true;
}
