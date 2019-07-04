import { observable, action, computed, autorun } from 'mobx';

import { synergies } from '../data/synergies.json';
import { Unit, ChampData, ChampCard, UnitSelection, BoardUnit, SynergyData, Synergy, SynergyStage } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT } from '../utils';
import { DataStore } from './data-store';


export class DraftStore {

    public static REFRESH_COST = 2;
    public static BUY_XP_COST = 4;
    public static BENCH_SIZE = 9;
    public static XP_PER_ROUND = 2;
    public static MAXIMIM_INTEREST = 5;
    public static TIME_PER_ROUND = 15;//seconds

    dataStore: DataStore;

    @observable
    pool: ChampCard[];

    @observable
    currentHand: (ChampCard | null)[];

    @observable
    benchedUnits: (Unit | null)[] = [];

    @observable
    boardUnits: BoardUnit[] = [];

    @observable
    xp: number = 0;

    @observable
    nextLevelXp: number = 2;

    @observable
    level: number = 1;

    @observable
    gold: number = 3;

    @observable
    isHandLocked: boolean = false;

    @observable
    activeUnit?: UnitSelection = undefined;

    @observable
    roundCount: number = 1;

    @observable
    isSplashOpen = true;

    constructor(dataStore: DataStore) {
        this.dataStore = dataStore;
        this.pool = [];
        this.currentHand = [];
        this.nextLevelXp = this.getXpForLevelUp(this.level + 1);
        this.benchedUnits = [...Array(DraftStore.BENCH_SIZE)].fill(null);
        this.boardUnits = [...Array(BOARD_WIDTH * BOARD_HEIGHT)].map(
            (_, index) => ({ unit: undefined, index } as BoardUnit)
        );
    }

    
    @action
    public start() {
        console.log("Lets Go!");     
        this.initializePool();
        this.drawHand();
        this.giveRandomStartingUnit();
        this.isSplashOpen = false;

        this.startTimer();
    }

 /*****************************
 * Unit Selection and Movement
 ******************************/

    private giveRandomStartingUnit() {
        //Always start with a 2 cost unit
        const potentialChamps = this.getChampsByCost(2);
        const index = Math.floor(Math.random() * potentialChamps.length);
        const champ = potentialChamps[index];

        //Find that champ
        const poolIndex = this.pool.findIndex(x => x.champ.id === champ.id);
        //Remove from pool
        this.pool.splice(poolIndex, 1);
        
        //Add to bench
        this.benchedUnits[0] = {
            tier: 1,
            champ
        };

    }
 
    public selectionsMatch(selA: UnitSelection, selB: UnitSelection): boolean {
        return selA !== undefined
            && selB !== undefined
            && selB.index === selA.index
            && selB.isBenched === selA.isBenched        
    }

    @action unitPickedUp(selection: UnitSelection) {
        this.activeUnit = selection;
    }

    @action unitDropped() {
        this.activeUnit = undefined;
    }

    @action
    public swapUnits(source: UnitSelection, dest: UnitSelection) {
        if(source.isBenched) {
            this.moveUnitToBench(dest.unit, source.index);
        } else {
            this.moveUnitToBoard(dest.unit, source.index);
        }

        if(dest.isBenched) {
             this.moveUnitToBench(source.unit, dest.index);
         } else {
            this.moveUnitToBoard(source.unit, dest.index);
         }
    }

    @action
    public shiftUnitToBench(selection: UnitSelection, index: number) {
        //Only if bench is empty
        if(this.benchedUnits[index] !== null) { 
            return;
        }

        //Remove unit from current space
        this.clearUnitFromCurrentSpace(selection);

        //Move into new space
        this.moveUnitToBench(selection.unit, index)
    }

    @action
    public shiftUnitToBoard(selection: UnitSelection, index: number) {
        //Only if board space is empty
        if(this.boardUnits[index].unit !== undefined) { 
            return;
        }

        if(this.placedUnitCount >= this.level) {
            return;
        }

        //Remove unit from current space
        this.clearUnitFromCurrentSpace(selection);

        //Move into new space
        this.moveUnitToBoard(selection.unit, index)
    }

    private clearUnitFromCurrentSpace(selection: UnitSelection) {
        if(selection.isBenched) {
            this.benchedUnits[selection.index] = null;
        } else {
            this.boardUnits[selection.index].unit = undefined;
        }
    }

    @action
    private moveUnitToBench(unit: Unit, index: number) {
        this.benchedUnits[index] = unit;
    }

    @action
    private moveUnitToBoard(unit: Unit, index: number) {
        const newBoardUnit = { index, unit } as BoardUnit;
        this.boardUnits[index] = newBoardUnit;
    }

/***************************
 * Synergies and Place Units
 ***************************/
    
    @computed
    public get placedUnitCount() {
        return this.boardUnits.filter(bu => bu.unit).length;
    }

    @observable
    showPlaced: boolean = false;

    public showPlacedDisposer = autorun(() => {
        if (this.placedUnitCount !== -1) {
            this.showPlaced = true;
            setTimeout(() => {
                this.showPlaced = false;
            }, 500);          
        }
    });

    @computed
    public get unitSynergies() {
        const champs: ChampData[] = this.boardUnits.map(x => x.unit).map(unit => unit ? unit.champ : null).filter(champ => champ !== null) as ChampData[];
        const champIds: string[] = champs.map(champ => champ.id);
        const uniqueChampIds: string[] = [...new Set(champIds)];

        const champClasses: string[] = uniqueChampIds.map(id => this.dataStore.champions.find(champ => champ.id === id)).flatMap(champ => champ === undefined ? [] : champ.classes).sort();
        const classCounts: object = champClasses.reduce((obj, id) => {
            obj[id] = (obj[id] || 0) + 1;
            return obj;
        }, {} as any);

        return classCounts;
    }

    @computed
    public get unitSynergiesWithTiers(): Synergy[] {
        const activeClasses = Object.keys(this.unitSynergies);

        return activeClasses.map( key => {
            const synergyData = (synergies as any)[key] as SynergyData;
            const count = (this.unitSynergies as any)[key] as number;

            let medalIndex = -1;
            synergyData.stages.forEach((x: SynergyStage, index: number) => {
                if (synergyData.exact && count === x.amount) {
                    medalIndex = index;
                } else if(synergyData && count >= x.amount) {
                    medalIndex = index;
                }
            });

            //Tiers, 1 = Gold, 2 = Silver, 3 = Bronze, 4 = Inactive;
            const tier = medalIndex === -1 ? 4 : synergyData.stages.length - medalIndex;
            const active = tier < 4;

            return {
                ...synergyData,
                id: key,
                tier,
                active,
                count
            } as Synergy;
        });
    }


    @action
    public toggleHandLock() {
        this.isHandLocked = !this.isHandLocked;
    }

    @action
    public nextRound() {
        this.roundCount += 1;   
        this.roundTimer = DraftStore.TIME_PER_ROUND;   

        this.gold += this.calculateIncome();
        this.addXP(DraftStore.XP_PER_ROUND);
        if(!this.isHandLocked) {
            this.gold += DraftStore.REFRESH_COST;
            this.refreshHand();    
        }
    }

    @observable
    roundTimer: number = DraftStore.TIME_PER_ROUND;

    @observable
    isPaused: boolean = true;

    private roundInterval: any = null;

    @action
    public startTimer() {
        this.isPaused = false;

        if(this.roundInterval) {
            clearInterval(this.roundInterval);
        }

        this.roundTimer = DraftStore.TIME_PER_ROUND;

        this.roundInterval = setInterval(() => {
            if(this.isPaused) { return; }
            --this.roundTimer;

            if(this.roundTimer <= 0) {
                this.nextRound();
            }
        }, 1000);
    }

    @action
    public toggleTimer() {
        this.isPaused = !this.isPaused;
    }

    public calculateIncome(): number {
        const passive = this.calculatePassiveIncome();
        const interest =  this.calculateInterest();
        const streak = this.calculateStreakBonus();
        return passive + interest + streak;
    }

    public calculateInterest(): number {
        return Math.min(Math.floor(this.gold / 10), DraftStore.MAXIMIM_INTEREST);
    }

    public calculateStreakBonus(): number {
        return 0; //TODO: Simulate Wins/Losses??
    }

    public calculatePassiveIncome(): number {
        switch(this.roundCount) {
            case 0: 
            case 1: return 2;
            case 2:
            case 3: return 3;
            case 4: return 4;
            default: return 5;
        }
    }

    @action
    public refreshHand() {
        if (this.gold < DraftStore.REFRESH_COST) {
            return;
        }

        //Return hand to pool
        this.currentHand.forEach(card => {
            if(card) {
                this.pool.push(card);
            }
        });

        this.currentHand.splice(0, 5);

        this.drawHand();
        this.gold -= DraftStore.REFRESH_COST;
    }

    @action
    public buyXP() {
        if(this.gold < DraftStore.BUY_XP_COST) {
            return;
        }
        this.addXP(4);
        this.gold -= DraftStore.BUY_XP_COST;
    }

    @action
    public addXP(amount: number) {
        this.xp += amount;
        //Level Up
        if(this.xp >= this.nextLevelXp) {
            this.xp = this.xp - this.nextLevelXp;
            this.nextLevelXp = this.getXpForLevelUp(this.level + 1);
            this.level += 1;
        }
    }

    @action
    public sellUnit(unitSelection: UnitSelection) {
        let unitExists = false;
        const { unit, index, isBenched } = unitSelection;

        //Remove Unit;
        if(isBenched) {
            if(this.benchedUnits[index] !== null) {
                this.benchedUnits[index] = null;
                unitExists = true;
            }
        } else {
            if(this.boardUnits[index].unit !== undefined) {
                this.boardUnits[index].unit = undefined;
                unitExists = true;
            }
        }

        //If there was a unit to sell, give gold;
        if(unitExists) {
            this.gold += this.getUnitSalePrice(unit);
            this.returnUnitToPool(unit);
        }
    }

    @action
    private  returnUnitToPool(unit: Unit) {
        const {champ} = unit;
        const unitsInPool = this.pool.filter(x => x.champ.id === champ.id);
        const guids = unitsInPool.map(x => x.guid);

        let iterations = 3**(unit.tier - 1);
        
        let index = 0;
        while(iterations > 0) {
            const guid = `${champ.id}_${index}`;
            if(!guids.includes(guid)) {
                --iterations;
                this.pool.push({
                    guid,
                    champ
                });
            }
            ++index;
        }
    }

    public getUnitSalePrice(unit: Unit): number {
        let tierBonus = 0;
        switch (unit.tier) {
            case 2: {
                tierBonus = 2;
                break; 
            }
            case 3: {
                tierBonus = 4;
                break;
            }
        }

        return unit.champ.cost + tierBonus;
    }

    @action
    public drawHand() {
        while(this.currentHand.length < 5) {
            this.drawCard();
        }
    }

    @action
    public drawCard() {
        const key = `level${this.level}`;
        const levelData = this.dataStore.levels.get(key);
        const odds = levelData ? levelData.tierOdds : [0,0,0,0,0];
        const roll = Math.random();

        const cost = this.getCost(roll, odds);

        const cardSet = this.pool.filter(x => x.champ.cost === cost);
        const index = Math.floor(Math.random() * cardSet.length);
        const card = cardSet[index];

        const indexToRemove = this.pool.findIndex(c => c.guid === card.guid);
        this.pool.splice(indexToRemove, 1);
        
        this.currentHand.push(card);
    }

    @action
    public initializePool() {
        this.pool = this.dataStore.champions.flatMap(champ => {
            const poolSize = this.getInitialPoolSizeForChamp(champ.id);
            return [...Array(poolSize)].map((_, index) => ({
                champ,
                guid: champ.id + "_" + index
            } as ChampCard));            
        });
    }

    @action
    public buyCard(card: ChampCard) {

        if(!card || !card.champ) {
            return;
        }

        const { guid, champ } = card;
        
        let cost = champ.cost;
        let removeExtra = false;

        if(this.gold < champ.cost) {
            return;
        }

        /* Several cases:
        1. Player has empty space for unit, all good
        2. Player has no empty space, but has 2 units of the same type at tier 1 already, merge to free up space
        3. Player has no empty space, but has 1 unit of the same type at tier 1,
           and the hand has 2 of that same champ
           3a. If they have the gold to buy 2, buy both and merge to free up space
           3b. If they don't have the gold, abort
        */

        //Add unit to bench
        const firstEmpty = this.benchedUnits.findIndex(x => x === null);
        //Case 1
        if(firstEmpty >= 0) {
            this.benchedUnits[firstEmpty] = ({
                tier: 1,
                champ
            });

        } else {
            const matchingBenchUnits = this.benchedUnits
                .filter(unit => unit !== null && unit.tier === 1 && unit.champ.id === champ.id);
            const matchingBoardUnits = this.boardUnits
                .map(bu => bu.unit || null)
                .filter(unit => unit !== null && unit.tier === 1 && unit.champ.id === champ.id);

            const matchingUnits = [...matchingBenchUnits, ...matchingBoardUnits];

            const availableToBuy = this.currentHand
                .filter(card => card != null && card.champ.id === champ.id) as ChampCard[];

            //Case 2
            if (matchingUnits.length === 2) {
                this.mergeUnits(1, availableToBuy); //Upgrade
            } else if (matchingUnits.length === 1 && availableToBuy.length >= 2) {
                if(this.gold >= champ.cost * 2) { //3a
                    cost *= 2; //Increase Cost
                    this.mergeUnits(1, availableToBuy); //Upgrade
                    removeExtra = true; //Flag that theres a 2nd card to remove
                } else { //3b
                    return;
                }
            } else {        
                return;
            }
        }

        //Remove card
        const index = this.currentHand.findIndex(c => c != null && c.guid === guid);
        this.currentHand[index] = null;

        //Remove 2nd card if needed
        if(removeExtra) {
            const index = this.currentHand.findIndex(card => card != null && card.champ.id === champ.id);
            this.currentHand[index] = null;    
        }

        //Merge Units
        this.mergeUnits(1);

        //Pay money
        this.gold -= cost;
    }

    @action
    private mergeUnits(tier: number = 1, extraCards: ChampCard[] = []) {
        const extraUnits: Unit[] = extraCards.map(card => ({champ: card.champ, tier: 1}));
        const boardUnits: (Unit|null)[] = this.boardUnits.map(bu => bu.unit || null);
        const totalUnits: (Unit|null)[] = [...this.benchedUnits, ...boardUnits, ...extraUnits];

        const onlyCurrentTier = totalUnits.filter(c => c!== null && c.tier === tier) as Unit[];
        
        //Remap to count champions
        const champCount = onlyCurrentTier.reduce((m: object, unit: Unit) => {
            const id = unit.champ.id;
            const val = (m as any)[id];
            if (!val) {
                (m as any)[id] = 1;
            } else {
                (m as any)[id] = val+1;
            }
            return m;
        }, {});

        //Find champs to merge
        const idsToMerge = Object.keys(champCount).filter(x => (champCount as any)[x] >= 3);

        //Merge and upgrade the champs
        idsToMerge.forEach(id => {
            const champ = (this.dataStore.champions).find(c => c.id === id);
            
            let index = -1;
            //Remove all of that unit from bench
            while(-1 !== (index = this.benchedUnits.findIndex(unit => 
                unit !== null &&
                unit.champ.id === id &&
                unit.tier === tier
            ))) {
                this.benchedUnits[index] = null;
            }

            //Remove all of that unit from the board
            index = -1;
            let boardIndex = -1;
            while(-1 !== (index = this.boardUnits.findIndex(boardUnit => 
                boardUnit.unit !== undefined &&
                boardUnit.unit.champ.id === id &&
                boardUnit.unit.tier === tier
            ))) {
                this.boardUnits[index].unit = undefined;
                boardIndex = index;
            }

            //Add upgraded unit
            //Priorise returning to board
            if(boardIndex !== -1) {
                this.boardUnits[boardIndex].unit = {
                    tier: tier + 1,
                    champ
                } as Unit;
            } else {
                const firstEmpty = this.benchedUnits.findIndex(x => x === null);
                this.benchedUnits[firstEmpty] = {
                    tier: tier + 1,
                    champ
                } as Unit;    
            }
        });

        if (tier === 1) {
            this.mergeUnits(2);
        }
    }

    private getXpForLevelUp(currentLevel: number) {
        const level = (this.dataStore.levels).get(`level${currentLevel}`);
        return level ? level.xp : 0;
    }

    private getInitialPoolSizeForChamp(id: string): number {
        const { unitsPerTier, champions} = this.dataStore;
        const champ = champions.find(x => x.id === id);
        if(champ == null) { return 0; }

        switch(champ.cost) {
            case 1: return unitsPerTier.get("tier1") || 0;
            case 2: return unitsPerTier.get("tier2") || 0;
            case 3: return unitsPerTier.get("tier3") || 0;
            case 4: return unitsPerTier.get("tier4") || 0;
            case 5: return unitsPerTier.get("tier5") || 0;
            default: return 0;
        }
    }

    private getCost(roll: number, odds: number[]) {
        let total = 0;
        let index = 0;
        while(total < roll) {
            total += odds[index];
            ++index;
        }
        return index;
    }

    private getChampsByCost(cost: number) {
        return this.dataStore.champions.filter(champ => champ.cost === cost);
    }

}