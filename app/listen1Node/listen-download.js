module.exports = (function () {
    const path = require('path');

    // 下载信息
    let mapWaitDownload = new Map();
    let mapDownloading = new Map();
    let mapDownloadingItem = new Map();
    let mapDownloaded = new Map();

    class Listen1Download {
        constructor() {
            listen1App.browser.webContents.session.on('will-download', (e, item) => {
                let downloadInfo = mapDownloadingItem.get(item.getURL());
                downloadInfo.item = item;
                //获取文件的总大小
                const totalBytes = item.getTotalBytes();

                //设置文件的保存路径，此时默认弹出的 save dialog 将被覆盖
                const fileName = downloadInfo.title + ' - ' + downloadInfo.author + path.extname(item.getFilename());
                const filePath = path.join(listen1App.app.getPath('downloads'), 'listen1', fileName);
                item.setSavePath(filePath);
                console.log(`[Begin        ]: ${fileName},Size:${totalBytes}`);

                //监听下载过程，计算并设置进度条进度
                let oldResiveBytes = -1;
                item.on('updated', () => {
                    var newResiveBytes = item.getReceivedBytes();
                    if ( newResiveBytes != oldResiveBytes){
                        oldResiveBytes = newResiveBytes;
                        listen1App.browser.setProgressBar( newResiveBytes/ totalBytes);
                        console.log(`[Downloading--]: (${Math.floor((newResiveBytes / totalBytes) * 100)}%)${fileName}`)
                    }
                });

                //监听下载结束事件
                item.on('done', (e, state) => {
                    //如果窗口还在的话，去掉进度条
                    if (!listen1App.browser.isDestroyed()) {
                        listen1App.browser.setProgressBar(-1);
                    }
                    mapDownloaded.set(downloadInfo.id,true);
                    mapDownloading.delete(downloadInfo.id);
                    mapDownloadingItem.delete(item.getURL());
                    //下载被取消或中断了
                    if (state === 'interrupted') {
                        listen1App.browser.webContents.send('tip', {
                            type: 'finished',
                            msg: `${fileName} 下载失败!`,
                            filePath: filePath
                        });
                        console.log(`[End          ]: ${fileName}(Failed)`)
                    } else {
                        listen1App.browser.webContents.send('tip', {
                            type: 'finished',
                            msg: `${fileName} 下载完成!`,
                            filePath: filePath
                        });
                        console.log('[End          ]:',`${fileName}(Success) [Wait:${mapWaitDownload.size}][Downing:${mapDownloading.size}][Finisehd:${mapDownloaded.size}]`);
                        download();
                    }
                });
            });
        }

        download(args) {
            if (mapDownloaded.has(args.id)) return;
            if (mapDownloading.has(args.id)) return;
            if (mapWaitDownload.has(args.id)) return;
            mapWaitDownload.set(args.id, args);
            console.log('[Added Task   ]:',args.title);
            download()
        }

    }
    // 下载音乐
    function download() {
        console.log('[Status       ]:',`[Wait:${mapWaitDownload.size}][Downing:${mapDownloading.size}][Finisehd:${mapDownloaded.size}]`);
        if (mapDownloading.size < 5) {
            for (var key of mapWaitDownload.keys()) {
                let item = mapWaitDownload.get(key);
                mapWaitDownload.delete(key);
                console.log('[Start        ]:',item.title,'[From]:',item.url);
                if (item.url && item.url != null && item.url.startsWith('http'))  {
                    mapDownloading.set(key, item);
                    mapDownloadingItem.set(item.url,item)
                    listen1App.browser.webContents.downloadURL(item.url);
                }
                else {
                    listen1App.browser.webContents.send('tip', {
                        type: 'finished',
                        msg: `${item.title + ' - ' + item.author} 下载失败!`,
                        filePath: ''
                    });
                }
                break;
            }
        }else{
            console.log('[Current Count]:',mapDownloading.size);
        }
    }

    return (new Listen1Download());
})
();