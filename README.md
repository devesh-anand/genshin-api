# Unofficial Genshin-api

For contribution guide, refer to [Contribution guidelines](./CONTRIBUTING.md).

## Characters:

```
/character
/character/:name
/character/weapon/:weapontype
/character/element/:element
/character/imglist
/character/imglist/:element
```

### /character (or /characters)

Gives a list of all characters.

### /character/:name

> :name is name of character.

Gives all the details and associated images of the character in `:name`.  
_example: [xiao](https://genshin-impact.up.railway.app/character/xiao)_

### /character/weapon/:weapontype

> :weapontype is the type of weapon in game: sword, polearm, claymore, catalyst

Gives list of all character of that specific weapon type.

### /character/element/:element

> :element is one of the elements in game: pyro, cryo, hydro, electro, geo, anemo, dendro

Gives list of all characters of that element.

### /character/imglist/:element

> :element is optional, just call /character/imglist to get all characters.

Gives name, key (eg: For Raiden Shogun, "raiden" is key), img and element.

## Weapons:

Work In Progress
