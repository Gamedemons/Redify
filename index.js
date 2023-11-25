const inquirer = require("inquirer");
const chalk = require("chalk");
const gradient = require("gradient-string");
const figlet = require("figlet");
var ProgressBar = require("progress");
const readline = require("readline");

const fs = require("fs");
const axios = require("axios");
const JSSoup = require("jssoup").default;
const htmlEntities = require("html-entities");

// Variables
const INFO_URL = "https://slider.kz/vk_auth.php?q=";
const DOWNLOAD_URL = "https://slider.kz/download/";
let index = -1;
let songsList = [];
let total = 0;
let notFound = [];

// Playlist URL
let url = "https://m.resso.com/Zs8RftAta/";
// let url = "https://www.resso.com/playlist/Favorite-songs-6950567530529855490";

// CR - Connection Refused
const connection_refused = chalk.hex("F18501");
// NF - Not Found
const not_found = chalk.hex("F18501");
// UC - Unescaped Character
const unescaped_char = chalk.hex("F18501");

function header() {
  console.clear();
  figlet(`Redify`, (err, data) => {
    console.log(gradient.pastel.multiline(data) + "\n");
    console.log(
      gradient.pastel.multiline(" A Resso Downloader - by Gamedemons") + "\n"
    );
  });
}

const download = async (song, url) => {
  try {
    let numb = index + 1;
    console.log(`\n(${numb}/${total}) Starting download: ${song}`);
    const { data, headers } = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
    });

    // Progress bar...
    const totalLength = headers["content-length"];
    const progressBar = new ProgressBar(
      "-> downloading [:bar] :percent :etas",
      {
        width: 40,
        complete: "=",
        incomplete: " ",
        renderThrottle: 1,
        total: parseInt(totalLength),
      }
    );

    data.on("data", (chunk) => progressBar.tick(chunk.length));
    data.on("end", () => {
      startDownloading(); //for next song!
    });

    // Saving File
    data.pipe(fs.createWriteStream(`${__dirname}/songs/${song}.mp3`));
  } catch {
    console.log(connection_refused("\nError - Connection refused"));
    startDownloading();
  }
};

const getURL = async (song, singer) => {
  try {
    let query = (song + "%20" + singer).replace(/\s/g, "%20");
    const { data } = await axios.get(INFO_URL + query);

    // when no result then [{}] is returned so length is always 1, when 1 result then [{id:"",etc:""}]
    if (!data["audios"][""][0].id) {
      // No result
      console.log(not_found("\nError - Song not found : " + song));
      notFound.push(song + " - " + singer);
      startDownloading();
      return;
    }

    //avoid remix,revisited,mix
    let i = 0;
    let track = data["audios"][""][i];
    let totalTracks = data["audios"][""].length;
    while (
      i < totalTracks &&
      /remix|revisited|reverb|mix/i.test(track.tit_art)
    ) {
      i += 1;
      track = data["audios"][""][i];
    }
    //if reach the end then select the first song
    if (!track) {
      track = data["audios"][""][0];
    }

    if (fs.existsSync(__dirname + "/songs/" + track.tit_art + ".mp3")) {
      let numb = index + 1;
      console.log(
        "\n(" + numb + "/" + total + ") - Song already present : " + song
      );
      startDownloading();
      return;
    }

    let link = track.url;
    link = encodeURI(link); // Replace unescaped characters

    let songName = track.tit_art;
    songName.replace(/\?|<|>|\*|\"|:|\||\/|\\/g, ""); // Removing special characters
    download(songName, link);
  } catch {
    console.log(unescaped_char("\nError - Unescaped character : " + song));
    startDownloading();
  }
};

const startDownloading = () => {
  try {
    index += 1;
    if (index === songsList.length) {
      console.log(chalk.green("\n\nAll Songs Downloaded\n"));
      console.log(chalk.yellow("Songs that are not found :"));
      let i = 1;
      for (let song of notFound) {
        console.log(`${i} - ${song}`);
        i += 1;
      }
      if (i === 1) console.log("None!");
      return;
    }

    let song = songsList[index].name;
    let singer = songsList[index].singer;
    getURL(song, singer);
  } catch {
    console.log(chalk.red("Directory Error"));
  }
};

async function getPlaylist() {
  try {
    let playlistObj = {};

    const response = await axios.get(url);
    let htmlContent = response.data;
    let soup = new JSSoup(htmlContent);

    // Scraping Content
    const playlistHeaderBlock = soup.find("div", "playlist-info");
    let playlistName = playlistHeaderBlock.find("h1").text.trim();
    let playlistUser = playlistHeaderBlock.find("h3").text.trim();
    console.log("Playlist : " + playlistName + " by " + playlistUser);

    playlistObj.playlist = htmlEntities.decode(playlistName);
    playlistObj.user = htmlEntities.decode(playlistUser);

    const tracksInfo = soup.findAll("li", "song-item"); //finding all songs info
    playlistObj.songs = [];

    for (let track of tracksInfo) {
      let songName = track.find("h3").text;
      let singerNames = track.find("p").text;
      singerNames = singerNames.replace(/\s{2,10}/g, ""); //remove spaces
      songName = songName.replace(/\?|<|>|\*|"|:|\||\/|\\/g, ""); //removing special characters which are not allowed in file name
      playlistObj.songs.push({
        name: htmlEntities.decode(songName),
        singer: htmlEntities.decode(singerNames),
      });
    }
    playlistObj.total = playlistObj.songs.length;

    return playlistObj;
  } catch {
    // Playlist error
    return "-1";
  }
}

async function askName() {
  const answers = await inquirer.prompt({
    name: "url",
    type: "input",
    message: "Enter the resso playlist url : ",
    default() {
      return "";
    },
  });

  url = answers.url;
}

async function initialize() {
  const logo_color = chalk.hex("FE0A6C");
  console.log(chalk.greenBright.bold("Welcome to REDIFY !"))

  await askName()
  // const askUrl = readline.createInterface({
  //   input: process.stdin,
  //   output: process.stdout,
  // });
  // askUrl.question("Enter the resso playlist url : ", function (answer) {
  //   url = answer;
  // });

  header();

  if(url === ''){
    console.log(chalk.red("Enter a resso playlist url !") + "\n");
  }

  getPlaylist().then((res) => {
    try {
      // Wrong URL
      if (res === "-1") {
        console.log(
          chalk.red(
            "Error fetching playlist info - Check if the playlist is valid"
          ) + "\n"
        );
        return;
      }

      songsList = res.songs;
      total = res.total;
      console.log("Total songs : " + total + "\n\n");

      //create folder
      let dir = __dirname + "/songs";
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      startDownloading();
    } catch {
      console.log(chalk.red("We ran into some unexpected error.") + "\n");
    }
  });
}

initialize();
