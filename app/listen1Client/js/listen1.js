//初始化一个 document.ready 事件
(function () {
    var ie = !!(window.attachEvent && !window.opera);
    var wk = /webkit\/(\d+)/i.test(navigator.userAgent) && (RegExp.$1 < 525);
    var fn = [];
    var run = function () {
        for (var i = 0; i < fn.length; i++) fn[i]();
    };
    var d = document;
    d.ready = function (f) {
        if (!ie && !wk && d.addEventListener)
            return d.addEventListener('DOMContentLoaded', f, false);
        if (fn.push(f) > 1) return;
        if (ie)
            (function () {
                try {
                    d.documentElement.doScroll('left');
                    run();
                }
                catch (err) {
                    setTimeout(arguments.callee, 0);
                }
            })();
        else if (wk)
            var t = setInterval(function () {
                if (/^(loaded|complete)$/.test(d.readyState))
                    clearInterval(t), run();
            }, 0);
    };
})();

//页面加载完成后，执行 初始化 客户端操作：
//1. 注册全局快捷键
(function () {
    nodeRequire('electron-titlebar');
    const ipcRenderer = nodeRequire('electron').ipcRenderer;
    document.ready(function () {
        initWinBtn();
        registerShortcuts();
    });

    function initWinBtn() {
        const w = nodeRequire('electron').remote.getCurrentWindow();
        let butonMinimize = document.querySelector('#electron-titlebar > .button-minimize');
        if (butonMinimize) butonMinimize.addEventListener('click', () => {
            w.hide();
        });
    }

    function registerShortcuts() {
        var divPlayer = document.querySelector('.m-playbar');
        var btnPrevious = divPlayer.querySelector('.btns a.previous');
        var btnNext = divPlayer.querySelector('.btns a.next');
        var btnPlay = divPlayer.querySelector('.btns a.play');
        var btnVolume = divPlayer.querySelector('.volume-ctrl a.icn');
        var btnDownload = divPlayer.querySelector('.ctrl a.icn-download');
        btnDownload.addEventListener('click', download);
        ipcRenderer.on('tip', (e, arg) => {
            switch (arg.type) {
                case 'finished': {
                    console.log(arg);
                    break;
                }
            }
        })
        globalShortcut = nodeRequire('electron').remote.globalShortcut;
        globalShortcut.unregisterAll();
        globalShortcut.register('Alt + F10', () => {
            btnVolume.click();
        });
        globalShortcut.register('Alt + Left', () => {
            btnPrevious.click();
        });
        globalShortcut.register('Alt + Right', () => {
            btnNext.click();
        });
        globalShortcut.register('Alt + F5', () => {
            btnPlay.click();
        });
        globalShortcut.register('CommandOrControl + Shift + D', () => {
            download();
        });
        ipcRenderer.send('operate',{type:'registerShortcut'})
    }

    function download() {
        var id = localStorage.getObject('player-settings').nowplaying_track_id;
        var splitPos = id.indexOf('_');
        var type = id.slice(0, splitPos);
        id = id.slice(splitPos + 1);
        getMusic(type, id)
        //xmtrack
        //http://www.xiami.com/song/1769291573
        //netrack
        //http://music.163.com/#/song?id=4876973
        //qqtrack
        //https://y.qq.com/n/yqq/song/004EF2Zr4e5U6J.html

        function getMusic(type, id) {
            var targetURL = '';
            switch (type) {
                case 'netrack':
                    targetURL = 'http://music.163.com/#/song?id=' + id;
                    break;
                case 'xmtrack':
                    targetURL = 'http://www.xiami.com/song/' + id;
                    break;
                case 'qqtrack':
                    targetURL = 'https://y.qq.com/n/yqq/song/' + id + '.html';
                    break;
            }
            if (targetURL) {
                ajax(targetURL)
            }
        }

        function ajax(targetURL) {
            $.ajax({
                type: 'post',
                url: "http://music.sonimei.cn/",
                async: true,
                dataType: 'json',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: {
                    mod: null,
                    url_data: targetURL,
                    type: 'url',
                    page: 1,
                    filter: 'url',
                    _type: 1
                },
                success: (response) => {
                    if (response.code == 200) {
                        response.data.forEach(item => {
                            // item.link   item.lrc;   item.pic;   item.title;   item.url;  item.author;
                            ipcRenderer.send('operate', {type: 'download', author: item.author, title: item.title, url: item.url})
                        });
                    } else {
                        console.log(response.error);
                    }
                }
            })
        }
    }
})();

