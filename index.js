#!/usr/bin/env node

const inquirer = require("inquirer");
const chalk = require("chalk");
const gradient = require("gradient-string");
const figlet = require("figlet");
const isUrl = require("is-url")
var ProgressBar = require("progress");
const fs = require("fs");
const axios = require("axios");
const JSSoup = require("jssoup").default;
const htmlEntities = require("html-entities");

// Variables
const INFO_URL = "https://slider.kz/vk_auth.php?q=";
let index = -1;
let songsList = [];
let notFound = [];
let total = 0;

// Playlist URL
let url = "";
let save_location = "";
// Error Colors
const connection_refused = chalk.hex("F18501");
const not_found = chalk.hex("F18501");
const unescaped_char = chalk.hex("F18501");
const warning = chalk.hex("FF7501");

try {
  // Helpers
  function getQueryResults(data){
    return data["audios"][""]
  }
  function verifyTrackUrl(data, index){
    return isUrl(data["audios"][""][index].url)
  }

  // Initials
  function header() {
    console.clear();
    figlet(`Ressdify`, (err, data) => {
      console.log(gradient.pastel.multiline(data) + "\n");
      console.log(
        gradient.pastel.multiline(" A Resso Downloader - by Gamedemons")
      );
      console.log(
        gradient.pastel.multiline(" Github - https://github.com/Gamedemons" + "\n")
      );
    });
  }
  async function askPlaylistUrl() {
    const answers = await inquirer.prompt({
      name: "url",
      type: "input",
      message: "Enter the resso playlist url : ",
      default() {
        return "https://m.resso.com/Zs8RftAta/";
      },
    });

    url = answers.url;
  }
  async function askSaveLocation() {
    const answers = await inquirer.prompt({
      name: "location",
      type: "input",
      message: "Enter the download location  : ",
      default() {
        return "";
      },
    });

    save_location = answers.location;
  }

  // Main
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
      getTrackUrl(song, singer);
    } catch {
      console.log(chalk.red("Directory Error."));
      return;
    }
  };

  const getTrackUrl = async (song, singer) => {
    let number = index + 1;
    try {
      let query = (song + "%20" + singer).replace(/\s/g, "%20");
      const { data } = await axios.get(INFO_URL + query);

      // No result
      if (!data["audios"][""][0].id) {
        console.log(
          not_found(`\n(${number}/${total}) Error - Song not found : ` + song)
        );
        notFound.push(song + " - " + singer);
        startDownloading();
        return;
      }

      //avoid remix,revisited,mix
      let i = 0;
      let track = data["audios"][""][i];
      let totalTracks = data["audios"][""].length;
      let hasBadUrl = !verifyTrackUrl(data, 0);

      while ((i < totalTracks && /remix|revisited|reverb|mix/i.test(track.tit_art)) || hasBadUrl) {
        i += 1;
        if(hasBadUrl){
          if(verifyTrackUrl(data, i)){
            track = getQueryResults(data)[i];
            hasBadUrl = false;
            break;
          }
        }
        track = data["audios"][""][i];
      }
      //if reach the end then select the first song
      if (!track) {
        track = data["audios"][""][0];
      }

      if (fs.existsSync(save_location + "/" + track.tit_art + ".mp3")) {
        console.log(`\n(${number}/${total}) Song already present : ` + song);
        startDownloading();
        return;
      }

      let link = track.url;
      link = encodeURI(link); // Replace unescaped characters

      let songName = track.tit_art;
      songName.replace(/\?|<|>|\*|\"|:|\||\/|\\/g, ""); // Removing special characters
      downloadTrack(songName, link);
    } catch {
      console.log(
        unescaped_char(
          `\n(${number}/${total}) Error - Unescaped character - Bad url returned : ` + song
        )
      );
      startDownloading();
      return
    }
  };

  const downloadTrack = async (song, url) => {
    let number = index + 1;
    try {
      console.log(`\n(${number}/${total}) Downloading: ${song}`);
      const { data, headers } = await axios({
        method: "GET",
        url: url,
        responseType: "stream",
      });

      // Progress bar...
      // · ▪ — 
      const totalLength = headers["content-length"];
      const progressBar = new ProgressBar(" <:bar>  :percent :etas", {
        width: 50,
        complete: "▪",
        incomplete: " ",
        renderThrottle: 1,
        total: parseInt(totalLength),
      });

      data.on("data", (chunk) => progressBar.tick(chunk.length));
      data.on("end", () => {
        startDownloading(); //for next song!
      });

      // Saving File
      data.pipe(fs.createWriteStream(`${save_location}\\${song}.mp3`));
    } catch {
      console.log(
        connection_refused(
          `(${number}/${total}) Error - Connection refused : ` + song
        )
      );
      startDownloading();
    }
  };

  async function initialize() {
    console.clear();
    console.log(chalk.greenBright.bold("Welcome to RESSDIFY !"));
    await askPlaylistUrl();
    console.log(warning("Do not enter system root as download location or two levels below it."))
    await askSaveLocation();
    header();

    if (url === "") {
      console.log(chalk.red("Enter a resso playlist url !") + "\n");
      return;
    }
    if (save_location === "" || !fs.existsSync(save_location)) {
      console.log(chalk.red("Enter valid download location !") + "\n");
      return;
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
        console.log("Playlist : " + res.playlist + " by " + res.user);
        console.log("Total songs : " + total + "\n");

        //create folder
        if (!fs.existsSync(save_location)) {
          fs.mkdirSync(save_location);
        }

        startDownloading();
      } catch {
        console.log(chalk.red("We ran into some unexpected error.") + "\n");
      }
    });
  }

  // Entry Point
  initialize();

} catch {
  console.log(
    chalk.red("We ran into an error.") + "\n"
  );
}
