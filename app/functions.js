const mm = require("music-metadata");
const path = require("path");
module.exports = {
  async readAudioTags(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    try {
      const metaData = await mm.parseFile(filePath);
      if (!metaData.common.title) {
        metaData.common.title = fileName;
      }
      return metaData;
    } catch (error) {
      console.warn(error);
      return {
        common: {
          title: fileName,
          album: "",
          artist: "",
        },
      };
    }
  },
};
