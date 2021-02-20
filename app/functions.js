const { parseFile } = require("music-metadata");
const { basename, extname } = require("path");
const fs = require("fs");
module.exports = {
  async readAudioTags(filePath) {
    const fileName = basename(filePath, extname(filePath));
    try {
      const metaData = await parseFile(filePath);
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
