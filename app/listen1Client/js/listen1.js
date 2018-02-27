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

    let playingList = [];

    function initWinBtn() {
        const w = nodeRequire('electron').remote.getCurrentWindow();
        let butonMinimize = document.querySelector('#electron-titlebar > .button-minimize');
        if (butonMinimize) butonMinimize.addEventListener('click', () => {
            w.hide();
        });
    }

    let allCount = 0;
    let finishedCount = 0;

    var browerTitle = document.querySelector('head title');
    function registerShortcuts() {
        var divPlayer = document.querySelector('.m-playbar');
        var btnPrevious = divPlayer.querySelector('.btns a.previous');
        var btnNext = divPlayer.querySelector('.btns a.next');
        var btnPlay = divPlayer.querySelector('.btns a.play');
        var btnVolume = divPlayer.querySelector('.volume-ctrl a.icn');
        var btnDownload = divPlayer.querySelector('.ctrl a.icn-download');
        var btnDownloadAll = divPlayer.querySelector('.menu-header a.icn-download');
        btnDownload.addEventListener('click', download);
        btnDownloadAll.addEventListener('click', () => {
            playingList = localStorage.getObject('current-playing');
            playingList.forEach(item=>{download(item.id)});
        });

        ipcRenderer.on('tip', (e, arg) => {
            switch (arg.type) {
                case 'finished': {
                    console.log(arg);
                    finishedCount++;
                    browerTitle.innerText = `[${finishedCount}/${allCount}]Listen1`;
                    if (finishedCount == allCount){
                        allCount = 0;
                        finishedCount = 0;
                        setTimeout(()=>{
                            browerTitle.innerText = `Listen1`;
                        },10000)
                    }
                    break;
                }
            }
        })
        globalShortcut = nodeRequire('electron').remote.globalShortcut;
        globalShortcut.unregisterAll();
        globalShortcut.register('Alt + L', () => {
            addToFavorite();
        });
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
        ipcRenderer.send('operate', {type: 'registerShortcut'})
    }

    function addToFavorite(){
        var btnAdd = document.querySelector('.m-playbar a.icn.icn-add');
        btnAdd.click();
        var playlist = document.querySelector('body > div.dialog > div.dialog-body > ul.dialog-playlist');
        if (playlist){
            var defList = playlist.querySelector('#defList');
            if (!defList){
                var allList = playlist.querySelectorAll('li.ng-scope');
                if (allList.length > 0){
                    var reg = new RegExp('^'+ 'all','i')
                    allList.forEach(item=>{
                        if (!defList && reg.test(item.innerText.trim())){
                            defList = item;
                            defList.id = 'defList';
                        }
                    })
                    if(!defList){
                        defList = allList[0];
                    }
                }
            }
            if(defList){
                defList.click();
            }
        }
    }

    function download(id) {
        if (!id)
            id = localStorage.getObject('player-settings').nowplaying_track_id;
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
                ajax(id,targetURL)
            }
        }

        function ajax(id,targetURL) {
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
                        let downloading = false;
                        let title,author;
                        response.data.forEach(item => {
                            title =  item.title;
                            author = item.author;
                            // item.link   item.lrc;   item.pic;   item.title;   item.url;  item.author;
                            if (!downloading && item.url && item.url != null && item.url && item.url != null && item.url.startsWith('http')){
                                downloading = true;
                                allCount++;
                                browerTitle.innerText = `[${finishedCount}/${allCount}] Listen1`;
                                ipcRenderer.send('operate', {
                                    type: 'download',
                                    id: id,
                                    author: item.author,
                                    title: item.title,
                                    url: item.url
                                })
                            }
                        });
                        if (!downloading){
                            ajaxSearchSong(id,title,author,'netease')
                        }
                    } else {
                        console.log(response.error);
                    }
                }
            })
        }
        const servers = {netease:'qq',qq:'kugou',kugou:'xiami',xiami:'baidu',baidu:'kuwo',kuwo: false};
        function ajaxSearchSong(id,title,author,server) {
            if (!server) {
                console.log(id,title,author,'歌曲查询失败!!!!!')
                return;
            }
            $.ajax({
                type: 'post',
                url: "http://music.sonimei.cn/",
                async: true,
                dataType: 'json',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: {
                    input: title + ' ' + author,
                    type: server,
                    filter: 'name',
                    page: 1,
                },
                success: (response) => {
                    if (response.code == 200) {
                        let downloading = false;
                        response.data.forEach(item => {
                            // item.link   item.lrc;   item.pic;   item.title;   item.url;  item.author;
                            if (!downloading && author == item.author && item.url && item.url != null && item.url && item.url != null && item.url.startsWith('http')){
                                downloading = true;
                                allCount++;
                                browerTitle.innerText = `[${finishedCount}/${allCount}] Listen1`;
                                ipcRenderer.send('operate', {
                                    type: 'download',
                                    id: id,
                                    author: item.author,
                                    title: item.title,
                                    url: item.url
                                })
                            }
                        });
                        if (!downloading){
                            ajaxSearchSong(id,title,author,servers[server])
                        }
                    } else {
                        console.log(response.error);
                    }
                }
            })
        }
    }
})();

