const pogobuf = require('./pogobuf/pogobuf/pogobuf');
const logger = require('winston');
const vercmp = require('semver-compare');
const _ = require('lodash');

function APIHelper(config, state) {
    this.config = config;
    this.state = state;
}

APIHelper.prototype.getRandomInt = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

APIHelper.prototype.alwaysinit = function(batch) {
    return batch.checkChallenge()
                .getHatchedEggs()
                .getInventory(this.state.api.inventory_timestamp)
                .checkAwardedBadges()
                .downloadSettings(this.state.api.settings_hash);
};

APIHelper.prototype.always = function(batch) {
    return batch.checkChallenge()
                .getHatchedEggs()
                .getInventory(this.state.api.inventory_timestamp)
                .checkAwardedBadges()
                .downloadSettings(this.state.api.settings_hash)
                .getBuddyWalked();
};

APIHelper.prototype.parseInventoryDelta = function(items) {

    // _.each(r.inventory_delta.inventory_items)

    // if (r.inventory_delta.inventory_items)
};

APIHelper.prototype.parse = function(responses) {
    if (!responses || responses.length == 0) return null;
    if (!(responses instanceof Array)) responses = [responses];

    let info = {};

    responses.forEach(r => {
        if (r.player_data) {
            // getPlayer()
            this.state.player = r.player_data;
            this.state.player.banned = r.banned;
            this.state.player.warn = r.warn;
            if (r.banned) throw new Error('Account Banned');
            if (r.warn) logger.error('Ban warning.');

        } else if (r.egg_km_walked) {
            // getHatchedEggs()
            if (r.egg_km_walked.length > 0 || r.stardust_awarded.length > 0 || r.candy_awarded.length > 0 ||
                r.experience_awarded.length > 0 || r.pokemon_id.length > 0) {
                console.dir(r, {depth: 4});

                // for(let stardust in r.stardust_awarded) {
                //     //this.state.inventory.player.
                // }
                // for (let xp in r.experience_awarded) {
                //     //this.state.inventory.player.experience += xp;
                // }
                // for (let candy in r.candy_awarded) {
                //
                // }
            }

        } else if (r.inventory_delta) {
            // getInventory()
            this.state.api.inventory_timestamp = r.inventory_delta.new_timestamp_ms;
            if (!this.state.hasOwnProperty('inventory')) {
                // console.dir(r.inventory_delta.inventory_items, { depth: 6 });
                this.state.inventory = pogobuf.Utils.splitInventory(r);
                this.state.inventory.eggs = _.filter(this.state.inventory.pokemon, p => p.is_egg);
                this.state.inventory.pokemon = _.filter(this.state.inventory.pokemon, p => !p.is_egg);

            } else if (r.inventory_delta.inventory_items.length > 0) {
                let split = pogobuf.Utils.splitInventory(r);

                console.log('---');
                console.dir(r.inventory_delta, {depth: 4});
                console.dir(split, {depth: 4});
                console.log('---');

                if (split.player) this.state.inventory.player = split.player;
                if (split.items.length > 0) {
                    _.each(split.items, i => {
                        let item = _.find(this.state.inventory.items, it => it.id == i.id);
                        if (item) {
                            item.count = i.count;
                            item.unseen = i.unseen;
                        } else {
                            this.state.inventory.items.push(i);
                        }
                    });
                }
                if (split.pokemon.length > 0) {
                    _.each(split.pokemon, pkm => {
                        if (pkm.is_egg) {
                            this.state.inventory.eggs = _.filter(this.state.inventory.eggs, e => e.id != pkm.id);
                            this.state.inventory.eggs.push(pkm);
                        } else {
                            this.state.inventory.pokemon = _.filter(this.state.inventory.pokemon, e => e.id != pkm.id);
                            this.state.inventory.pokemon.push(pkm);
                        }
                    });
                }
            }

        } else if (r.awarded_badges) {
            // checkAwardedBadges()
            if (r.awarded_badges.length > 0 || r.awarded_badge_levels > 0) {
                console.log('checkAwardedBadges()');
                console.dir(r, {depth: 4});
            }

        } else if (r.hash) {
            // downloadSettings()
            this.state.api.settings_hash = r.hash;
            if (r.settings) {
                if (this.config.api.checkversion && vercmp(this.config.api.clientversion, r.settings.minimum_client_version) < 0) {
                    throw new Error('Minimum client version=' + r.settings.minimum_client_version);
                }
                this.state.download_settings = r.settings;
                this.state.client.mapObjectsMinDelay = r.settings.map_settings.get_map_objects_min_refresh_seconds * 1000;
                this.state.api.gmapkey = this.state.download_settings.map_settings.google_maps_api_key;
            }

        } else if (r.item_templates_timestamp_ms) {
            // downloadRemoteConfigVersion()
            this.state.api.item_templates_timestamp = r.item_templates_timestamp_ms;

        } else if (r.hasOwnProperty('show_challenge')) {
            // checkChallenge()
            if (r.show_challenge) {
                logger.error('Challenge!', {challenge_url: r.challenge_url});
                throw Error(`Challenge detected: ${r.challenge_url}`);
            }

        } else if (r.hasOwnProperty('digest')) {
            // getAssetDigest()

        } else if (r.item_templates) {
            // downloadItemTemplates()
            if (r.item_templates.length > 0) {
                this.state.item_templates = r.item_templates;
            }

        } else if (r.hasOwnProperty('cooldown_complete_timestamp_ms')) {
            // fortSearch
            if (r.result == 1) {
                _.each(r.items_awarded, i => {
                    let item = _.find(this.state.inventory.items, it => it.item_id == i.item_id);
                    if (item) item.count += i.item_count;
                });

                if (r.pokemon_data_egg) {
                    this.state.inventory.eggs.push(r.pokemon_data_egg);
                }

                this.state.player.experience += r.experience_awarded;
                info.cooldown = r.cooldown_complete_timestamp_ms;

            } else {
                logger.warn('fortSearch() returned %s', r.result);
            }

        } else if (r.items_awarded) {
            // levelUpRewards
            if (r.result == 1) {
                console.log('levelUpRewards()');
                console.dir(r, {depth: 4});
                _.each(r.items_awarded, i => {
                    let item = _.find(this.state.inventory.items, it => it.item_id == i.item_id);
                    if (item) item.count += i.item_count;
                });
            }

        } else if (r.hasOwnProperty('candy_earned_count')) {
            // getBuddyWalked
            if (r.family_candy_id || r.candy_earned_count) {
                console.dir(r, {depth: 4});
            }

        } else if (r.badges) {
            // getPlayerProfile

        } else if (r.map_cells) {
            // getMapObjects
            let forts = r.map_cells.reduce((all, c) => all.concat(c.forts), []);
            let pokestops = forts.filter(f => f.type == 1);
            let gyms = forts.filter(f => f.type == 2);
            let wildPokemons = r.map_cells.reduce((all, c) => all.concat(c.wild_pokemons), []);
            let catchablePokemons = r.map_cells.reduce((all, c) => all.concat(c.catchable_pokemons), []);
            let nearbyPokemons = r.map_cells.reduce((all, c) => all.concat(c.nearby_pokemons), []);
            // let spawnPoints = r.map_cells.reduce((all, c) => all.concat(c.spawn_points), []);

            this.state.map = {
                pokestops: pokestops,
                gyms: gyms,
                wild_pokemons: wildPokemons,
                catchable_pokemons: catchablePokemons,
                nearby_pokemons: nearbyPokemons,
                // spawn_points: spawnPoints
            };

        } else {
            logger.warn('unhandled');
            logger.warn(r);

        }
    });

    return info;
};

module.exports = APIHelper;
