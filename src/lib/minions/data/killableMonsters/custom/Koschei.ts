import { Monsters } from 'oldschooljs';
import LootTable from 'oldschooljs/dist/structures/LootTable';

import setCustomMonster from '../../../../util/setCustomMonster';

export const koscheiTable = new LootTable().add('Fremennik blade');

setCustomMonster(234262, 'Koschei the deathless', koscheiTable, Monsters.Vorkath, {
	id: 234262,
	name: 'Koschei the deathless',
	aliases: ['koschei the deathless', 'koschei', 'ko']
});

const Koschei = Monsters.find(mon => mon.name === 'Koschei the deathless')!;

export default Koschei;
