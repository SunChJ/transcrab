---
title: 用 Astra 编程：我们到底为什么要这么做？
date: '2026-09-12T04:41:45.356Z'
sourceUrl: 'https://lucumr.pocoo.org/2026/9/7/astra-why/'
lang: zh
---
写于 2026 年 9 月 7 日

我越来越确信，整个 AI 工程领域都在[内卷](https://en.wikipedia.org/wiki/Neijuan)——字面意思是向内蜷曲。在中国，这个词描述的是一种系统：它要求人们投入越来越多的努力、参与越来越激烈的竞争，却没有改善产出。在西方，它有时会以[996 这种荒唐玩意儿](https://lucumr.pocoo.org/2025/9/4/996/)的形式出现。“内卷”对应的英文是 Involution，出自《[农业内卷化](https://en.wikipedia.org/wiki/Agricultural_Involution)》一书。农业内卷化指的是耕作不断精细化，单位面积产出提高了，人均产出却原地踏步。

这就是我现在对 AI 的感受。

这就说到 GPT 6 Astra。无论从哪个角度看，Astra 都是一个令人惊叹的模型。这一点，我实在没什么可反驳的。它擅长操作计算机，能理解图像和复杂问题，而且会不知疲倦地追求任务完成。它确实了不起；这类模型一定会以某种形式改变世界。

但至少眼下，我不知道该如何把它用在真正的软件工程中。这个观点在 Twitter 上引起了不少关注，所以我想整理一下思路，直接给大家看看这东西究竟会写出什么样的代码。

## 我的垃圾代码工厂

“Armin，你应该搞个软件工厂！”这话我已经听过好几次了，于是我想，不如趁它发布，在周末跑一个小型软件工厂庆祝一下。既然大家都在批量制造粗制滥造的 3D 游戏，那我应该拿它做点有用的事。我刻意让模型全权决定软件工厂的工作方式。它可以自由管理自己的上下文，也可以在 `agent-notes` 文件夹里维护自己的记录，然后启动子智能体去干活。目标呢？试试看能不能做出一个支持[虚拟线程](https://lucumr.pocoo.org/2025/7/26/virtual-threads/)和词法作用域的 Python。结果，我为此烧光了 ChatGPT 一个额度重置周期的 token，似乎大约有 40 亿。35 小时后，这座工厂没有交付任何有价值的东西，也没让我学到怎样才能把软件工厂运营得更好。

不过，它生成了大量代码和输入提示词，因此还是留下了一些可供研究的材料。它表现出了一些我在 Sol 和更早的 OpenAI 模型上没见惯的行为 <a id="fnref-1"></a>[1](#fn-1)。后来，我在用 Astra 做普通编程时也遇到了同样的问题，所以这不只是软件工厂造成的。

我开始怀疑，训练过程里是不是有什么地方“出了问题”。模型完成长时程任务会得到很高的奖励，但写出“烂代码”恐怕没受到多少惩罚。看起来，结果就是 Astra 特别擅长[制作 3D 内容](https://developers.openai.com/blog/how-to-build-games-with-astra)，而且能持续工作很久，途中还会给自己找活干。我让它对扫地机器人做了不少逆向工程，有些做法相当惊艳。所以，它确实很酷！

## 把工具调用写成代码高尔夫

我对 Astra 的第一个不满，是它用于工具调用的代码风格。Codex 越来越依赖“只用 bash”来执行各种操作。最近几个版本中，原版 Codex 运行框架一直直接使用 `sed` 等工具读取文件。你通常看不到这些命令，是因为 Codex 会[解析 bash 命令](https://github.com/openai/codex/blob/f1aac1e885f676a1129f2da0c46a3dba86392fc6/codex-rs/shell-command/src/parse_command.rs#L2290-L2504)，识别出来就把它们隐藏起来。但 Astra……真的很爱 Python？这倒不算意外，早期 OpenAI 模型有时也会临时写 Python 代码来读取和操作文件，只是在我看来，Astra 用得实在有点过头。

这里要先作一个重要说明：这个项目*非常套娃*，因为我正在修改的就是 CPython 解释器*本身*。但我可以保证，即使是在 Pi 中处理 TypeScript 代码，我也见过这个模型用 Python 做奇怪的事。不过，我手上最多的怪代码证据，还是来自那个周末里*完全无人监督*的垃圾代码工厂。

它写 Python 没什么值得关注的，值得关注的是它写出了什么样的 Python。我收集了一些输出，大家可以扫一眼。

用 Python 字符串拼接修改 C 代码

在 Codex 运行框架中，我发现好几次子智能体完全放弃补丁工具，改用 Python 手动操作字符串。

```python
python3 - <<'PY'
from pathlib import Path
p=Path('Include/internal/pycore_intrinsics.h');s=p.read_text().replace('#define MAX_INTRINSIC_1                         14','#define INTRINSIC_RETAIN_ANNOTATION_CELLS        15\n\n#define MAX_INTRINSIC_1                         15');p.write_text(s)
p=Path('Python/intrinsics.c');s=p.read_text();idx=s.index('#define INTRINSIC_FUNC_ENTRY');s=s[:idx]+'''/* Hold every old cell until the compiler has published the entire site's new
   capture. A replaced cell's finalizer may reenter module __annotate__. */
static PyObject *
retain_annotation_cells(PyThreadState *tstate, PyObject *holders)
{
    if (!PyTuple_CheckExact(holders)) {
        PyErr_SetString(PyExc_TypeError, "annotation holders must be a tuple");
        return NULL;
    }
    Py_ssize_t size = PyTuple_GET_SIZE(holders);
    PyObject *previous = PyTuple_New(size);
    if (previous == NULL) return NULL;
    for (Py_ssize_t i = 0; i < size; i++) {
        PyObject *holder = PyTuple_GET_ITEM(holders, i);
        if (!PyCell_Check(holder)) {
            Py_DECREF(previous);
            PyErr_SetString(PyExc_TypeError, "annotation holder must be a cell");
            return NULL;
        }
        PyObject *cell = PyCell_Get(holder);
        PyTuple_SET_ITEM(previous, i, cell == NULL ? Py_NewRef(Py_None) : cell);
    }
    return previous;
}

''' +s[idx:];s=s.replace('    INTRINSIC_FUNC_ENTRY(INTRINSIC_AWAIT_BLOCK, await_block)','    INTRINSIC_FUNC_ENTRY(INTRINSIC_AWAIT_BLOCK, await_block)\n    INTRINSIC_FUNC_ENTRY(INTRINSIC_RETAIN_ANNOTATION_CELLS, retain_annotation_cells)');p.write_text(s)
p=Path('Python/codegen.c');s=p.read_text();idx=s.index('static int\ncodegen_annassign(');s=s[:idx]+'''static int
codegen_retain_annotation_cells(compiler *c, location loc, PyObject *captures)
{
    Py_ssize_t pos = 0;
    PyObject *binding, *holder;
    while (PyDict_Next(captures, &pos, &binding, &holder)) {
        ADDOP_NAME(c, loc, LOAD_CLOSURE, holder, cellvars);
    }
    ADDOP_I(c, loc, BUILD_TUPLE, PyDict_GET_SIZE(captures));
    ADDOP_I(c, loc, CALL_INTRINSIC_1, INTRINSIC_RETAIN_ANNOTATION_CELLS);
    return SUCCESS;
}

''' +s[idx:]
a=s.index('                if (conditional_annotation_index != NULL) {',s.index('codegen_annassign(compiler *c'))
b=s.index('                if (captures != NULL) {',a)
# Move lookup before conditional registration and retain old cells before anything changes.
lookupstart=s.index('                PyObject *captures = _PyCompile_AnnotationCaptures',a)
lookup=s[lookupstart:b].replace('                    return ERROR;','                    Py_XDECREF(conditional_annotation_index); return ERROR;')
s=s[:lookupstart]+s[b:]
setup=lookup+'''                if (captures != NULL && codegen_retain_annotation_cells(c, loc, captures) < 0) {
                    Py_XDECREF(conditional_annotation_index); return ERROR;
                }
'''
s=s[:a]+setup+s[a:]
needle='                        ADDOP_NAME(c, loc, STORE_DEREF, holder, cellvars);\n                    }\n                }'
s=s.replace(needle,'                        ADDOP_NAME(c, loc, STORE_DEREF, holder, cellvars);\n                    }\n                    ADDOP(c, loc, POP_TOP); /* release old cells after full publication */\n                }',1);p.write_text(s)
p=Path('Include/internal/pycore_magic_number.h');s=p.read_text().replace('    Python 3.16a1 3709 (Checked deferred annotation closure capture)','    Python 3.16a1 3709 (Checked deferred annotation closure capture)\n    Python 3.16a1 3710 (Retain replaced annotation captures until publication)').replace('#define PYC_MAGIC_NUMBER 3709','#define PYC_MAGIC_NUMBER 3710');p.write_text(s)
p=Path('Lib/test/test_block_annotation_captures.py');s=p.read_text();idx=s.index('    def test_typing_consumers');s=s[:idx]+'''    def test_replaced_cell_finalizer_sees_complete_site_publication(self):
        module=execute("""\\
            events=[]
            class V:
                def __init__(self,n): self.n=n
                def __del__(self):
                    if self.n == 0: events.append(__annotate__(1))
            for i in range(2):
                x=V(i) # bind x y
                y=i
                value:(x.n,y)
        """)
        self.assertEqual(module.events,[{'value':(1,1)}])
        self.assertEqual(module.__annotate__(1),{'value':(1,1)})

''' +s[idx:];p.write_text(s)
PY
make -j1 > /tmp/block-annotations-build7.log 2>&1
```

Socket 代码高尔夫

在一次对话中，智能体运行测试遇到了“Bad file descriptor”。于是 Astra 决定，用极度压缩的代码检查 macOS 上能否通过 Unix socket 传递文件描述符：

```python
/usr/bin/python3 - <<'PY'
import socket,os,array
for into in (False,True):
 a,b=socket.socketpair();fd=os.open(os.devnull,os.O_RDONLY);b.sendmsg([b'c'],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[fd]))]);print('fds',a.fileno(),b.fileno(),fd)
 if into:r=a.recvmsg_into([bytearray(1),bytearray(),bytearray(19)],socket.CMSG_SPACE(4),socket.MSG_PEEK|socket.MSG_DONTWAIT)
 else:r=a.recvmsg(20,socket.CMSG_SPACE(4),socket.MSG_PEEK|socket.MSG_DONTWAIT)
 print('peek',r,flush=True)
 rights=array.array('i',r[1][0][2]);print('rights',rights,flush=True)
 for f in rights:
  try: print('stat',os.fstat(f))
  except Exception as e: print('error',e)
 r=a.recvmsg(20,socket.CMSG_SPACE(4),socket.MSG_DONTWAIT);print('consumed',r,flush=True)
 a.close();b.close();os.close(fd)
PY
```

用 Python 修改智能体笔记

智能体几乎始终都用 Python 更新笔记：

```python
python3 - <<'PY'
from pathlib import Path
p=Path('agent-notes/live/block-with-bindings.md');s=p.read_text().replace('  has117/77/zero failures.', '  has117/77/zero failures; existing bundled Expat unreachable-fallthrough\n  warnings are the only optimized warnings.')
# Keep the final evidence readable without rewriting historical parent requirements.
for a,b in [('all328','all 328'),('pass31','pass 31'),('pass all328','pass all 328'),('pass,9.2s','pass, 9.2s'),('log`,210','log`, 210'),('log`,5,731','log`, 5,731'),('log`:18/18','log`: 18/18'),('pass,88','pass, 88'),('pass,90','pass, 90'),('skips,1m','skips, 1m'),('all6,280','all 6,280'),('has117','has 117')]: s=s.replace(a,b)
s += '\nKey source review: Python/symtable.c:603 (discovery), :3985 (sequential header traversal),\nPython/codegen.c:3488 (source-only exclusion), :5836 (publication), :5853 (normal/\nunwind reference cleanup), :5925/:6037 (enter-protected target setup).\n'
p.write_text(s)
for name in ('STATE.md','build-and-test.md'):
 p=Path('agent-notes/live')/name;s=p.read_text()
 for a,b in [('build:117','build: 117'),('paths.18','paths. 18'),('paths.\n18','paths.\n18'),('and210','and 210'),('pass5,731','pass 5,731'),('All6,280','All 6,280'),('failures,31','failures, 31'),('in\n115s','in\n115s'),('have117','have 117'),('paths.\n18','paths.\n18'),('18 focused,210','18 focused, 210'),('and5,731','and 5,731'),('all6,280','all 6,280')]: s=s.replace(a,b)
 p.write_text(s)
PY
git diff --check
git add -u
git add Lib/test/test_block_with_bindings.py agent-notes/done/asyncio-task-drivers.md
git diff --cached --stat
git commit -m 'Add explicit with and async with header bindings'
```

用 Python 运行 Node.js

它好几次用 Python 在另一台机器上启动 Node.js。先写脚本，再通过 Bash 运行 Python，然后由这个程序通过 `prlctl`，在我的 Windows 机器上运行 Node.js。

```python
import subprocess
code = "const{readFileSync}=require('fs');const{strict:a}=require('assert');const c=require('C:/Users/mitsuhiko/AppData/Local/Temp/pi-clipboard-threads/win32-arm64.node');(async()=>{const p=c.getText();a.ok(p instanceof Promise);const saved=await p;const image=await c.getImage();if(image||saved===null){console.log('arm64 async text/image reads passed; preserving non-text clipboard');return}try{for(const text of ['café 日本語','', 'large'.repeat(200000)]){const p=c.setText(text);a.ok(p instanceof Promise);await p;a.equal(await c.getText(),text);a.equal(await c.getImage(),null)}console.log('Windows ARM64 async Unicode, empty, large text and empty image passed')}finally{await c.setText(saved)}})().catch(e=>{console.error(e);process.exitCode=1})"
subprocess.run(['prlctl', 'exec', 'Windows 11', '--current-user', 'C:\\Program Files\\nodejs\\node.exe', '-e', code], check=True)
```

用 Python 运行 Node.js，再运行 PowerShell

既然已经走上这条路，它索性用 Bash 运行 Python，再运行 Node.js，最后让 Node.js 调用 PowerShell。

```python
import subprocess
code = "process.env.PSModulePath='C:/Windows/System32/WindowsPowerShell/v1.0/Modules';require('child_process').spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','C:/Users/mitsuhiko/AppData/Local/Temp/pi-clipboard-threads/pi-clipboard-windows.ps1'],{stdio:'inherit'});console.log('completed')"
subprocess.run(['prlctl', 'exec', 'Windows 11', '--current-user', 'C:\\Program Files\\nodejs\\node.exe', '-e', code], check=True)
```

你可以觉得这很好笑，但我有几个疑问。第一个问题是，人根本读不懂这种代码。如果你想跟上它正在做什么，祝你好运。尤其是它一旦放弃运行框架提供的编辑工具，你就只能依赖最终产物的 diff 查看器，因为几乎不可能通过阅读这些代码，实时看清它做了哪些修改。

在 Pi 中，大多数时候还没这么糟，因为我通常看到它在用 `edit` 工具修改文件。但当它开始疯狂使用子智能体时——仿佛觉得没人看着——各种行为就会越来越离奇。我其实不知道模型是否会认为有人在看，但它给我的感觉就是这样。

接着，它开始在真正提交进仓库的代码里也搞这些荒唐事。我主要是在测试中看到的，不过它编写嵌在 HTML 里的 JavaScript 或 CSS 时，也会出现类似情况。似乎只要与普通代码“隔了一层”，它就开始陷入这些模式。

下面是它生成的一些单元测试：

完全无视空白和缩进

```python
def test_unpack_suspension_and_continuation_close(self):
    from continuations import Continuation,suspend
    readers=[]
    class Source:
        def __iter__(self):
            yield 1
            suspend('unpacking')
            yield 2
    ns=execute('''
        def run():
            a,b='old-a','old-b'
            readers.append(lambda: (a,b))
            def a,b=Source()
            suspend('published')
    ''',Source=Source,readers=readers,suspend=suspend)
    with Continuation(ns['run']) as continuation:
        self.assertEqual(continuation.resume(),'unpacking')
        self.assertEqual(readers[0](),('old-a','old-b'))
        self.assertEqual(continuation.resume(),'published')
        self.assertEqual(readers[0](),(1,2))
    class Value:pass
    refs=[];frames=[];callbacks=[]
    ns=execute('''
        def run():
            for def x in [Value()]:
                refs.append(weakref.ref(x))
                frames.append(sys._getframe())
                callbacks.append(lambda: x)
                suspend('body')
    ''',Value=Value,refs=refs,frames=frames,callbacks=callbacks,weakref=weakref,sys=sys,suspend=suspend)
    with Continuation(ns['run']) as continuation:self.assertEqual(continuation.resume(),'body')
    self.assertNotIn('x',frames[0].f_locals)
    self.assertIsNotNone(refs[0]());callbacks.clear();self.assertIsNone(refs[0]())

def test_ast_roundtrips_and_future_annotation_unparse(self):
    source='callback=lambda {for def a, [b,*rest] in [(1,[2,3])] {return a,b,rest}}'
    tree=ast.parse(source);node=tree.body[0].value.body[0]
    self.assertIsInstance(node,ast.ForBinding)
    self.assertEqual(node._fields,('target','iter','body','orelse','type_comment'))
    self.assertEqual(node.lineno,1);self.assertGreater(node.end_col_offset,node.col_offset)
    self.assertEqual(ast.dump(tree),ast.dump(ast.parse(ast.unparse(tree))))
    ns=execute('from __future__ import annotations\ndef f(arg: '+source.split('=',1)[1]+'): pass')
    self.assertEqual(eval(ns['f'].__annotations__['arg'])(),(1,2,[3]))
    tree=ast.parse('async def f():\n async for def x in values: pass # type: ignored\n')
    self.assertIsInstance(tree.body[0].body[0],ast.AsyncForBinding)
    self.assertEqual(ast.dump(tree),ast.dump(ast.parse(ast.unparse(tree))))
```

所以，至少在某些情况下，它为节省工具调用 token 而挤成一团的 Python 垃圾代码，会渗入那些本应持久保存的 Python 代码里。而且，这样确实更省 token。上面两个单元测试，按它们原本所在类的层级缩进后，这种写法的 token 用量比执行 `ruff format` 后少 10%。

## 只要你不看，它就是 AGI

我觉得现在有几股力量，把事情推向了彼此冲突的方向。这些模型的训练正在迅速加速，而且大概也开始走向递归式自我改进。模型的奖励可能综合了 token 效率、任务完成率，也许还有圈复杂度之类的简单指标。但我们人类并不是靠几个简单、容易量化的指标来判断代码是否易读、易懂。这些指标都很容易单独测量，也很容易在局部进行优化。

然而，局部优化不会带来全局最优，而且看输出的人越少，整体结果就越不受重视。显然，我的软件工厂在大约 35 小时的运行里彻底搁浅了，不过从它留下的笔记中，你能看出它是如何一步步滑向疯狂的。比如，任务文件里的编号，一开始还乐观地写着 1、2、3、5、5a，后来变成 8a、8a1，最后一路演变成 8b2c2b3 和“8b2c2b2b checkpoint1”。它生成的代码也越来越离谱。我不想用它试图构建的东西烦大家，不过可以看看这些解释器修改片段：

到处都是硬编码常量

我不知道这些数字是从哪来的，但到了某个阶段，它开始从一个模块向 C 实现传递随意的常量。起初，这个函数主要用于测试断言；可就在我关闭实验之前，非测试代码也开始依赖它了。

```python
static PyObject *
native_probe_run_impl(PyObject *callback, int sleep, int operation, PyObject *other)
{
    pthread_mutexattr_t attr;
    pthread_mutex_t mutex;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_RECURSIVE);
    pthread_mutex_init(&mutex, &attr);
    pthread_mutexattr_destroy(&attr);
    pthread_mutex_lock(&mutex);
    int previous = native_sentinel;
    pthread_mutex_t *previous_mutex = native_mutex;
    native_sentinel = previous + 1;
    native_mutex = &mutex;
    PyThreadState *tstate = PyThreadState_Get();
    PyGILState_STATE gil = PyGILState_Ensure();
    int saved_errno = errno;
    PyObject *result = NULL;
    Py_ssize_t value;
    /* No intervening Python frame: these exercise ambient C provenance. */
    switch (operation) {
        case 0: result = PyObject_CallNoArgs(callback); break;
        case 1: result = PyNumber_Add(callback, other); break;
        case 2: result = PyNumber_Negative(callback); break;
        case 3: result = PyObject_RichCompare(callback, other, Py_LT); break;
        case 4:
            value = PyObject_IsTrue(callback);
            if (value >= 0) result = PyBool_FromLong(value);
            break;
        case 5:
            value = PyObject_Length(callback);
            if (value >= 0) result = PyLong_FromSsize_t(value);
            break;
        case 6: result = PyObject_GetIter(callback); break;
        case 7: result = PyIter_Next(callback); break;
        case 8: result = PyObject_GetItem(callback, other); break;
        /* ... */
        case 21:
            result = PyType_Type.tp_call(callback, other, NULL);
            break;
        case 22: case 23: case 24: case 25: case 26:
            result = conversion_probe(operation, callback); break;
        case 27: case 28: case 29:
            result = protocol_probe(operation, callback, other); break;
        case 30: case 31: case 32: case 33: case 34: case 35:
        case 36: case 37: case 38: case 39: case 40: case 41:
        case 42: case 43: case 44: case 45: case 46:
        case 47: case 48: case 49: case 50: case 51: case 52:
        case 53: case 54: case 55: case 56: case 57: case 58: case 59:
        case 60: case 61: case 62: case 63: case 64: case 65: case 66:
        case 67: case 68: case 69: case 70: case 71: case 72:
            result = collection_probe(operation, callback, other); break;
        default: PyErr_SetString(PyExc_ValueError, "bad probe operation");
    }
```

在 C 代码的同一行里调用多个宏

CPython 代码库中没有这种代码风格，但它却出现在了新生成的代码中。

```python
PyObject *info = PyTuple_Pack(3, name, mangled, suite->su_id);
PyObject *flags = PyLong_FromLong(DEF_LOCAL);
if (key == NULL || info == NULL || flags == NULL ||
    PyDict_SetItem(suite->su_bindings, mangled, key) < 0 ||
    PyDict_SetItem(st->st_cur->ste_block_bindings, key, info) < 0 ||
    (private && PyDict_SetItem(st->st_binding_info, key, info) < 0) ||
    (private && PyDict_SetItem(st->st_cur->ste_symbols, key, flags) < 0)) {
    Py_DECREF(mangled); Py_XDECREF(key); Py_XDECREF(info); Py_XDECREF(flags);
    goto error;
}
Py_DECREF(mangled); Py_DECREF(key); Py_DECREF(info); Py_DECREF(flags);
```

生产代码中的随意索引

和操作编号一样，它也会把状态塞进列表，用随意的整数索引访问。

```python
def _register_task(task):
    """Register an asyncio Task scheduled to run on an event loop."""
    _scheduled_tasks.add(task)
    if _task_accelerator is not None:
        _task_accelerator[6](task)


def _register_eager_task(task):
    """Register an asyncio Task about to be eagerly executed."""
    _eager_tasks.add(task)
    if _task_accelerator is not None:
        _task_accelerator[8](task)


def _enter_task(loop, task):
    if (_task_accelerator is not None and
            _task_accelerator[5]() is loop and loop not in _current_tasks):
        return _task_accelerator[1](loop, task)
    # ...
```

丑陋的 C 词法分析器代码

这不是该代码库的风格。说实话，这不该成为任何人的代码风格。我不明白模型为什么要这样写。

```python
static int
apply_layout(tokenizeriterobject *it)
{
    PyObject *source = PyBytes_FromStringAndSize(it->tok->source.bytes, it->tok->source.len);
    if (source == NULL) return -1;
    PyObject *events = _PyPegen_tokenize_layout(PyBytes_AS_STRING(source), it->tok->filename);
    Py_DECREF(source);
    if (events == NULL) return -1;
    PyObject *result = PyList_New(0);
    if (result == NULL) { Py_DECREF(events); return -1; }
    Py_ssize_t index = 0;
    PyObject *first_pos = PyTuple_GET_ITEM(PyList_GET_ITEM(it->pending, 0), 2);
    PyObject *last_pos = PyTuple_GET_ITEM(PyList_GET_ITEM(it->pending, PyList_GET_SIZE(it->pending)-1), 2);
    PyObject *previous = NULL;
    for (Py_ssize_t i = 0; i < PyList_GET_SIZE(events); i++) {
        PyObject *event = PyList_GET_ITEM(events, i);
        if (previous && PyObject_RichCompareBool(previous, event, Py_EQ) == 1) continue;
        previous = event;
        PyObject *token = layout_token(it, event);
        if (token == NULL) goto error;
        if (token == Py_None) { Py_DECREF(token); continue; }
        PyObject *pos = PyTuple_GET_ITEM(token, 2);
        if (PyObject_RichCompareBool(pos, first_pos, Py_LE) == 1 ||
            PyObject_RichCompareBool(pos, last_pos, Py_GT) == 1) { Py_DECREF(token); continue; }
        while (index < PyList_GET_SIZE(it->pending)) {
            PyObject *old = PyList_GET_ITEM(it->pending, index);
            int cmp = PyObject_RichCompareBool(PyTuple_GET_ITEM(old, 2), pos, Py_LT);
            if (cmp < 0) { Py_DECREF(token); goto error; }
            if (!cmp) break;
            if (PyList_Append(result, old) < 0) { Py_DECREF(token); goto error; }
            index++;
        }
        if (index < PyList_GET_SIZE(it->pending)) {
            PyObject *old = PyList_GET_ITEM(it->pending, index);
            long kind = PyLong_AsLong(PyTuple_GET_ITEM(old, 0));
            if ((kind == NL || kind == NEWLINE || kind == INDENT || kind == DEDENT) &&
                PyObject_RichCompareBool(PyTuple_GET_ITEM(old, 2), pos, Py_EQ) == 1) index++;
        }
        if (PyList_Append(result, token) < 0) { Py_DECREF(token); goto error; }
        Py_DECREF(token);
    }
    for (; index < PyList_GET_SIZE(it->pending); index++) {
        if (PyList_Append(result, PyList_GET_ITEM(it->pending, index)) < 0) goto error;
    }
    Py_SETREF(it->pending, result);
    Py_DECREF(events);
    return 0;
error:
    Py_DECREF(events);
    Py_DECREF(result);
    return -1;
}
```

这里的失败模式似乎相当明显：模型在训练中被要求为工具调用节省 token，而这些调用本身也长得像代码；有时，它似乎就把这类代码带进了不该去的地方——代码库。

## 一个提示词，跑了 35 小时

我真不知道该说什么。这台垃圾代码机器跑了 35 小时，直到我把它关掉。期间，它净增了 7.5 万行代码，而且没有停下来的意思。这 35 小时里，它消耗了约 10 亿 token，按原始 API 价格计算，总成本约为 1,200 美元。它生成了 79 次提交，平均每次提交约 15.5 美元，智能体之间交换了约 1,400 条消息。

> 译注：原文前面估计消耗约 40 亿 token，此处写约 10 亿 token，未说明两者的统计口径或差异原因；译文保留原始数字。

说真的，我不需要一个智能体围绕单个提示词跑 35 小时。显然，这既行不通，也得不到合理的产出。

所以很明显：像这样给它下指令很蠢。但只要放着不管，它就*真的会*一直跑下去，而早期模型不会这样。连 Fable 都没这么疯狂。你一不小心交给它一个稍微过大的任务，它就会一直干到成功为止，哪怕耗尽整个订阅额度。

这也差不多解释了为什么我现在没法太信任这个模型。它已经表明，自己会把垃圾代码提交进仓库，这就迫使我花更多精力审查。即使失败率很低，我也不想要这样的行为。

## 一次性代码与入库代码

当工具调用代码一味追求 token 效率和“把事情做完”时，我不禁想：训练过程真的获得了足够多的信号，来重视“人能看懂正在发生什么”吗？在我看来，Astra 写出的相当一部分代码是“客观地糟糕”。但这份“客观”来自我作为人的判断。也许对于一个完全由智能体编写、只需智能体理解的代码库来说，它又是客观地好。

所以，我越来越认真地问自己：我们到底为什么要这么做？这些新模型当然令人惊叹。但我越来越怀疑，它们的发展方向是否还适合今天的软件工程流程。我之所以问这个问题，是因为我原本觉得，之前那些模型已经把软件工程带到了一个相当不错的位置，而这也是 AI 经济中能够证明正向回报的领域。可是 Fable 贵了那么多，Astra 又贵了那么多，我并不觉得结果配得上这些成本。

事实上，面对 Astra 和 Fable，我不仅觉得成本高得惊人，也觉得它们已经不适合我这个软件工程师了。大概是因为，这些模型越来越面向其他人：律师、3D 艺术家、数学家，以及需要计算机操作能力的人，等等。

也许，作为这些能力带来的副产品，你如今可以在一个周末里，让它一次性糊出一个看起来很惊艳的 3D 游戏。大概只要不在乎代码，你也能让软件工厂一直运转。

我想我迟早会习惯，但这东西真是怪得很。

**后记：** 说到奇怪：这些模型明明待在沙盒里，据说无法与其他智能体通信，为什么还能找到[同一批公共 wiki](https://collusion.wiki/)，把它们当作智能体通信的草稿板？难道它们在训练时就串通好，记住了以后可能派上用场的互联网资源？

<a id="fn-1"></a>

1. 我需要说明，以前我也做过类似实验。通常它们不会运行这么久，而且智能体留下的软件即使不完美，也仍然能让人理解。[↩](#fnref-1)

本文标签：[ai](https://lucumr.pocoo.org/tags/ai/) 和 [thoughts](https://lucumr.pocoo.org/tags/thoughts/)

[复制为](https://lucumr.pocoo.org/2026/9/7/astra-why.md) / [查看](https://lucumr.pocoo.org/2026/9/7/astra-why.md) Markdown
