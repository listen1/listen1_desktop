const mm = require("music-metadata");
const path = require("path");
module.exports = {
  async readAudioTags(filePath) {
    const tag = {
      tags: {
        title: path.basename(filePath, path.extname(filePath)),
        artist: "",
        album: "",
      }
    };
    try {
      tag.tags = (await mm.parseFile(filePath)).common;
    } catch(err) {
    }
    return tag;
  }
};
