const mm = require("music-metadata");
const path = require("path");
module.exports = {
  readAudioTags(filePath) {
    return new Promise((resolve, reject) => {
      let tag = {};
      tag.tags = {
        title: path.basename(filePath, path.extname(filePath)),
        artist: "",
        album: "",
      };
      mm.parseFile(filePath)
        .then((metaData) => {
          tag.tags = metaData.common;
          resolve(tag);
        })
        .catch(() => {
          resolve(tag);
        });
    });
  },
};
