const { parseFile } = require("music-metadata");
const { basename, extname } = require("path");
module.exports = {
  async readAudioTags(filePath) {
    const fileName = basename(filePath, extname(filePath));
    try {
      const metaData = await parseFile(filePath);
      metaData.common.title ||= fileName;
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
