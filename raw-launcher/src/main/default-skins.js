// Skin Minecraft par défaut (Steve, modèle « wide », 64×64) encodé en base64.
// Sert de BASE OPAQUE pour réparer les skins joueur avant publication : on compose
// le skin de l'utilisateur PAR-DESSUS ce Steve. La couche de base (corps) de Steve est
// 100 % opaque et sa couche overlay (2ᵉ couche : chapeau/veste…) 100 % transparente,
// ce qui garantit après composition une base toujours opaque (fini les membres/têtes
// rendus en NOIR à cause d'une base transparente) TOUT en préservant l'overlay du joueur.
// L'alpha des variantes wide/slim de Steve étant identique, un seul suffit ; le modèle
// slim ignore de toute façon la 4ᵉ colonne des bras. cf. feature-offline-skins (mémoire).
const STEVE_SKIN_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAdVBMVEUAAAD///+3g2sAzMyzeV4KvLyqclkAr68ApKSbY0mUYD4ElZWPXj6QWT8FiIiBUzkAf38Denp2SzNVVVV3QjVSPYlqQDBKSkpGOqUAaGhBNZs/Pz86MYk3Nzc/KhVJJRAoKCg0JRIzJBFCHQorHg0mGgokGAjoejraAAAAAXRSTlMAQObYZgAAAtFJREFUeNrtlm132jAMhelKFWuOHdr1hYYkZcbz//+Ju5LjsXRwEujHcSNsOefc50gmEK+KYgyIEJtRq0sVw4AQwBN0DQBmudyTyl0OgDvgcz0g5iZcbuFyQAggxGFoXAO5+nKA7AFUN/m6GAB3BCM29QfU1MuN4kwyDhAIWASZgmZxye7HlEJAwC9XEhxikPvDot6jDLz+tib+qeshBC0D1FmAVpxiZFqviYjVldvQRuYB+vhxorsX4pc7Suz0VkgKCku+/5AYInp9JWIoaf0pCSTOAlJMjuvmu6s/np8PSJqaHW4KIC4BNA5+FuPh44Dv32HBTh7HX9DCX2UH9f1+X9b3xMDSfTeq3K+qyjARnQTs933/B8AO4pMAAvxsBbOABwDmKzjfgpEWPlfQtl273W47TG2L2UKVIWYyVc4NRlgrZJg2kCyOgO4I2ELWe1tVlgij5pDa1Q/A+/sG6REwGtsC8I+P3sAiA3IlWAm1G6sALE4DEI9QMUluxIXPZtQ7JPMEIG0IoYPE5I0C/AiwAmFmJ5cKi2kFCLgVJGV7YxQwtqAFERETY4CboCkAKrOHrJSNbSi5LJkyQgGII6CdAiw8Xso2xkquACMAlTYyqaBTo2CQQdZbhNEiNEMCv2diBUBTwNtbN+pNBZcyYLQiccPvCYBCmAD6HVw/xLqTdJe/DNTjYZMEHSHZZgBnAP8N6PudGHc9hBEA7Wnbep/3BSyMTPDmLVDE6qb/Ug9ZlYEqJKubbvqk2ZetvJOIiCW/5sChAMdEX6jgoSLoKxUYx4taKOeFti0v3Q1UXu2ieUBxdgBB+jpXgo7LAJ0A2iPAZjNiaQUFgKycB4rG/4OiI/DcecGJWC6Vm68AZkgrkJxhzUeDrMtagASgdqUwLd9ESABOASqdFjxE5UlABmnvap8BnDsvFL/YZwCnzwsK4ALgGcCJ8wLnTUCQTP/8Hn4DsAh5tPm8HxQAAAAASUVORK5CYII='

module.exports = { STEVE_SKIN_B64 }
