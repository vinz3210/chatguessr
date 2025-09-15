import mapList from '../lib/mapList.json';
import emoteList from '../lib/emoteList.json';

export default class MapSelector {
    #defaultMapList: any[];
    #onlineMapList: any[];
    #mapList: any[];

  constructor() {
    this.#defaultMapList = mapList;
    this.#onlineMapList = [];
    this.#mapList = this.#defaultMapList;
    this.getOnlineMapList().then(mapList => {
        this.#onlineMapList = mapList;
        if(this.#onlineMapList.length > 0){
            this.#mapList = this.#onlineMapList;
        }
    }).catch(() => {
        // stick with default map list
    });
  }

    async getOnlineMapList(){
        // fetch maps from vinz3210.gg/automaplist.json
        try{
            const response = await fetch('https://vinz3210.gg/automaplist.json', { mode: 'no-cors' });
            const data = await response.json();
            return data;
        }
        catch(err){
            console.error(err);
            return [];
        }
    }

    async checkIfMapExists(URL: string): Promise<boolean>{
        try{
            let queryURL = "https://www.geoguessr.com/maps/"+ URL;
            // check if queryURL returns a 200 status code
            const response = await fetch(queryURL);
            return response.ok;
        }
        catch(err){
            console.error(err);
            return false;
        }
    }

    async getMapSample(numberOfMaps: number){
        // each of the maps has a weight attribute, which is used to determine the probability of the map being selected
        // select 5 maps at random, with the probability of each map being selected being proportional to its weight
        // return the list of selected maps
        let mapSample: any[] = [];
        let totalWeight = 0;
        let mapWeights: number[] = [];
        let mapList = this.#mapList;
        console.log("mapList", this.#mapList);

        // calculate the total weight
        for(let map of mapList){
            totalWeight += map.weight;
            mapWeights.push(map.weight);
        }

        // select 5 maps
        for(let i = 0; i < numberOfMaps; i++){
            let rand = Math.random() * totalWeight;
            let sum = 0;
            for(let j = 0; j < mapList.length; j++){
                sum += mapWeights[j];
                if(rand < sum){
                    mapSample.push(mapList[j]);
                    break;
                }
            }
        }

        // for each map in the sample list, remove it from the mapList
        for(let map of mapSample){
            let index = mapList.indexOf(map);
            mapList.splice(index, 1);
        }

        // for each of the maps in the sample list check if the map exists
        // if the map does not exist, remove it from the sample list
        for(let map of mapSample){
            let exists = await this.checkIfMapExists(map.URL);
            if(!exists){
                let index = mapSample.indexOf(map);
                mapSample.splice(index, 1);
                // log as error
                console.error("Map does not exist: " + map.URL);
            }
        }

        // for each of the maps in the sample list, add a random unique emote to the map
        let emotes = [...emoteList];
        for(let map of mapSample){
            let emoteIndex = Math.floor(Math.random() * emotes.length);
            map.emote = emotes[emoteIndex];
            emotes.splice(emoteIndex, 1);
        }
        console.log("mapSample", mapSample);
        return mapSample;
    }


  
}