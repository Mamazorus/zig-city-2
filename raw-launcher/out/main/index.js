//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
//#endregion
//#region modpack.json
var modpack_exports = /* @__PURE__ */ __exportAll({
	configs: () => configs,
	default: () => modpack_default,
	launcherName: () => launcherName,
	loader: () => loader,
	loaderVersion: () => loaderVersion,
	maxRam: () => 10,
	minRam: () => 4,
	minecraft: () => minecraft,
	mods: () => mods,
	packName: () => packName,
	port: () => port,
	server: () => server
}), launcherName, packName, minecraft, loader, loaderVersion, server, port, configs, mods, modpack_default;
var init_modpack = __esmMin((() => {
	launcherName = "RawLauncher";
	packName = "ZIG CITY 2";
	minecraft = "1.21.1";
	loader = "neoforge";
	loaderVersion = "21.1.143";
	server = "109.239.153.124";
	port = 25965;
	configs = [{
		"path": "config/simplehats.json5",
		"content": "{\n	// Allow Hat In Helmet Slot\n	\"allowHatInHelmetSlot\": true\n}\n"
	}];
	mods = [
		{
			"name": "[1.21.1] SecurityCraft v1.9.12.jar",
			"url": "https://drive.usercontent.google.com/download?id=1xaONqyWHQ4-6ox3imJUcKSv_S3LWFFgb&export=download&confirm=t"
		},
		{
			"name": "accessories_cclayer-9.3.1-beta.28+1.21.1-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1zDjnvMW7D91BzbMmbRE-gJQtaB-En_3g&export=download&confirm=t"
		},
		{
			"name": "accessories-neoforge-1.1.0-beta.42+1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1pyw5zBtcRmqiM9Q-eqQYjw5GParTOYCU&export=download&confirm=t"
		},
		{
			"name": "additional_lights-neoforge-1.21-2.1.9.jar",
			"url": "https://drive.usercontent.google.com/download?id=1XYoBeKdtyI8jzJVTr4PA-KsS9e2QnDN-&export=download&confirm=t"
		},
		{
			"name": "amendments-1.21-1.2.24-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1oFtNUCcZISGNHNd33SYr8_O5PcBUE9kS&export=download&confirm=t"
		},
		{
			"name": "architectury-13.0.8-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1NvogQ0wqCIFlQm6-hlgqZ85eEvE-_SMP&export=download&confirm=t"
		},
		{
			"name": "armourersworkshop-forge-1.21.1-3.2.0-beta.jar",
			"url": "https://drive.usercontent.google.com/download?id=1g-q3nojS4NnCDUvzHGlER-PyZtovdEJ8&export=download&confirm=t"
		},
		{
			"name": "athena-neoforge-1.21-4.0.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1leWPrB_YPPiVyrN4uqaDfKVCrpMjYbOw&export=download&confirm=t"
		},
		{
			"name": "ATi Structures V1.4.2 (1.21+).jar",
			"url": "https://drive.usercontent.google.com/download?id=1NfPrb23lc-jIGNQmAjp7rNjmVAnSuEbh&export=download&confirm=t"
		},
		{
			"name": "automobility-0.5.0.c+1.21.1-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1FUpoDZuesS8NK9HCJ3X5UoXCS3JzizA6&export=download&confirm=t"
		},
		{
			"name": "Axiom-4.8.0-for-MC1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=1uga_iy6WTgtpw2dLPqKCtjwnXsIzKDwA&export=download&confirm=t"
		},
		{
			"name": "balm-neoforge-1.21.1-21.0.31.jar",
			"url": "https://drive.usercontent.google.com/download?id=1_nysdCRGwfGp82m5mE0OmHZpm9ELC7h_&export=download&confirm=t"
		},
		{
			"name": "bibliocraft-1.21.1-1.4.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1y6Pb3NZLDmpE09E7XEQrX2hCt-s8wlDJ&export=download&confirm=t"
		},
		{
			"name": "blockui-1.0.199-1.21.1-snapshot.jar",
			"url": "https://drive.usercontent.google.com/download?id=1thTZ46P_sZL9LtnHcYnaLKE2TQ2hBeMm&export=download&confirm=t"
		},
		{
			"name": "burgermod-neoforge-2.10.1-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1eGt04YfQS5OivkVoxor9HofgnR-ZLs41&export=download&confirm=t"
		},
		{
			"name": "butcher-3.1-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1dI8ba3kpjX1AUr9KnRPYf8xpIog1bkxM&export=download&confirm=t"
		},
		{
			"name": "c2me-neoforge-mc1.21.1-0.3.0+alpha.0.63.jar",
			"url": "https://drive.usercontent.google.com/download?id=1gMgrQORL5TzfJpwBExCYLUdJY2dersWl&export=download&confirm=t"
		},
		{
			"name": "camera-neoforge-1.21.1-1.0.19.jar",
			"url": "https://drive.usercontent.google.com/download?id=19aGO01kIj4pBBMPAMDfoL_sk6E4MMxSr&export=download&confirm=t"
		},
		{
			"name": "chipped-neoforge-1.21.1-4.0.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=17SvZo3pWBcmYaHAelO6y_bq_-KOJcxwo&export=download&confirm=t"
		},
		{
			"name": "choccos_mobs-0.1.3-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1uRl0UrJ6Zpe5kZxlcdkaHmR_eGcaNvam&export=download&confirm=t"
		},
		{
			"name": "cloth-config-15.0.140-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=10qQLYtWUr1SXJZpuiM04gnZ2KdnNmyCl&export=download&confirm=t"
		},
		{
			"name": "connector-2.0.0-beta.7+1.21.1-full.jar",
			"url": "https://drive.usercontent.google.com/download?id=19WefD2NN_bSrl5Lbm32ctZ1szL1lo1Cp&export=download&confirm=t"
		},
		{
			"name": "ConnectorExtras-1.12.1+1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1aUNzmpDOb5mabfL0sPllPW7uZeRDAYQd&export=download&confirm=t"
		},
		{
			"name": "corail_woodcutter-neoforge-1.21.1-3.4.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1kJaNL5QXW4eggTmmhemN4x8kJULD2Baj&export=download&confirm=t"
		},
		{
			"name": "corpse-neoforge-1.21.1-1.1.5.jar",
			"url": "https://drive.usercontent.google.com/download?id=1U8iQmcUTvOayUoFOvEsa7e3bmSw1Bqof&export=download&confirm=t"
		},
		{
			"name": "cosmeticarmorreworked-1.21.1-v1-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1zkEbneukpybCvwnU5tyOnmawkNfu6GgE&export=download&confirm=t"
		},
		{
			"name": "craftedcore-5.8.jar",
			"url": "https://drive.usercontent.google.com/download?id=1VByVSEQtBqrv05IuEpeYQtiBa_A23-M3&export=download&confirm=t"
		},
		{
			"name": "CraftTweaker-neoforge-1.21.1-21.0.27.jar",
			"url": "https://drive.usercontent.google.com/download?id=14p0avBHI6tGp1OzAh7Imtqq-xSOeGCos&export=download&confirm=t"
		},
		{
			"name": "crazythings-1.1.1-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1xDmhO25vZYM27gK3X465a-EXXC1TQ2ug&export=download&confirm=t"
		},
		{
			"name": "create-1.21.1-6.0.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1vG5qQDLnG_VfsTblCfu20CpqXGCX5Rhu&export=download&confirm=t"
		},
		{
			"name": "create-stuff-additions1.21.1_v2.1.0e.jar",
			"url": "https://drive.usercontent.google.com/download?id=1JdWm-cd8Pc9jKeFluRZpWtIX8SmCFjXo&export=download&confirm=t"
		},
		{
			"name": "CreativeCore_NEOFORGE_v2.13.6_mc1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1TsM7MIsWEZ9mFkxJvSMR2U4OJvinnWWv&export=download&confirm=t"
		},
		{
			"name": "CreeperOverhaul-neoforge-1.21.1-4.0.6.jar",
			"url": "https://drive.usercontent.google.com/download?id=1XpmDCrZQhRYA7UsAXsBMCU-TmkKLy83V&export=download&confirm=t"
		},
		{
			"name": "CTM-1.21-1.2.1+3.jar",
			"url": "https://drive.usercontent.google.com/download?id=1PQ-x8BGj2stxR2bjbw6IA-SL9qhRdTQ_&export=download&confirm=t"
		},
		{
			"name": "cupboard-1.21-2.9.jar",
			"url": "https://drive.usercontent.google.com/download?id=1T5Kqj0Yzpw4-8rJQP3vCVoO01NH0BEDs&export=download&confirm=t"
		},
		{
			"name": "CustomNPCs-Unofficial-NeoForge-1.21.1.20241226.jar",
			"url": "https://drive.usercontent.google.com/download?id=1_NMj_oB_r8IXm8lV03jhm_onSFkbcXca&export=download&confirm=t"
		},
		{
			"name": "domum-ornamentum-1.0.213-snapshot-main.jar",
			"url": "https://drive.usercontent.google.com/download?id=1kZxAITID2vGmaSfkH31-RO9BP4QxYMfb&export=download&confirm=t"
		},
		{
			"name": "downwithdestruction-neoforge-1.21-1.21.0.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1NLvBaUN_ajLAZaD8AXcJ_zHWfWmmMf5H&export=download&confirm=t"
		},
		{
			"name": "DungeonCrawl-NeoForge-1.21-2.3.15.jar",
			"url": "https://drive.usercontent.google.com/download?id=12m7VWT7mA3AtUOcfCI0lFQJ0gzgeWni6&export=download&confirm=t"
		},
		{
			"name": "DungeonsArise-1.21.x-2.1.64-release.jar",
			"url": "https://drive.usercontent.google.com/download?id=19YyXj9bN-NBVHPlIQpNMupOiJzScKLHO&export=download&confirm=t"
		},
		{
			"name": "EdivadLib-1.21-3.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1MPsNVe91-IF74Q34YE_599Zo_2jPXpu0&export=download&confirm=t"
		},
		{
			"name": "emotecraft-for-MC1.21.1-2.4.9-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1fgS4bOHgwx-qcvhtc-JdimZ8MWOD0DUY&export=download&confirm=t"
		},
		{
			"name": "endermanoverhaul-neoforge-1.21.1-2.0.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=13R2tkUYUQ90f4fe6uqd6fxaO8D0_aQjY&export=download&confirm=t"
		},
		{
			"name": "etched-4.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1GHBwpFzq_I3IW4RklaaeuN-1VeUqwld5&export=download&confirm=t"
		},
		{
			"name": "ExtraStorage-1.21.1-5.0.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=11KEaTrDVsYuNsvMeTeWHU12Oo0n2xi2L&export=download&confirm=t"
		},
		{
			"name": "fancymenu_neoforge_3.4.6_MC_1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1F7Eav5VZqqnR5VRW5TmCNI1ZGgBiBVBw&export=download&confirm=t"
		},
		{
			"name": "farsight-1.21-3.8.jar",
			"url": "https://drive.usercontent.google.com/download?id=1kAnn27VsUdxrGH1W9RbkIrmQe-nanci8&export=download&confirm=t"
		},
		{
			"name": "ferritecore-7.0.2-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1oEY5CjpVXyuXCUPZh3v6iMUMiWYnVgG2&export=download&confirm=t"
		},
		{
			"name": "figura-0.1.5+1.21.1-neoforge-mc.jar",
			"url": "https://drive.usercontent.google.com/download?id=1RmS9JokmUhcCXXpz0o7UdHa0L5P_LOJq&export=download&confirm=t"
		},
		{
			"name": "ForgeConfigAPIPort-v21.1.3-1.21.1-NeoForge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1TxCEK7QacXTYSLBawlB60qevbWuXfkes&export=download&confirm=t"
		},
		{
			"name": "forgified-fabric-api-0.107.0+2.0.25+1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Gvy_jQ19XmfnMVSOn-4GoIOJjUIGRHt0&export=download&confirm=t"
		},
		{
			"name": "FramedBlocks-10.3.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1W2ENNAWZme4VjVgdUo2KqrP4cMOn7LC_&export=download&confirm=t"
		},
		{
			"name": "framework-neoforge-1.21.1-0.9.6.jar",
			"url": "https://drive.usercontent.google.com/download?id=1eOVzjPFzQ-FF7xdUsZt01NfdveN1BKA_&export=download&confirm=t"
		},
		{
			"name": "geckolib-neoforge-1.21.1-4.7.5.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=16c0kZURj09kn3SiowO6zy6bCE7NP8t_4&export=download&confirm=t"
		},
		{
			"name": "GlitchCore-neoforge-1.21.1-2.1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Aq01VJ0aicyBrA7daGoPFmXno70bmRIf&export=download&confirm=t"
		},
		{
			"name": "goatduloat-2.2.2-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1GtOLo6b0f21w-JoIBhXVR6B38-qSW1W8&export=download&confirm=t"
		},
		{
			"name": "goblintraders-neoforge-1.21.1-1.11.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1YExnhSfXOFkKBiA4qN3cxFMFCmPc8ip3&export=download&confirm=t"
		},
		{
			"name": "hiddennames-1.21.0-1.0.5.jar",
			"url": "https://drive.usercontent.google.com/download?id=1FWiOed3J3jYOcIDgIiYtJ5GdOjff_B0L&export=download&confirm=t"
		},
		{
			"name": "incontrol-1.21-10.1.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1QXcg5COxwT09BX3-ldM_wwDs5E-Krekv&export=download&confirm=t"
		},
		{
			"name": "iris-neoforge-1.8.8+mc1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=128LzjvEOoPxY5Qr3IyRj5SsEbLQK966q&export=download&confirm=t"
		},
		{
			"name": "Jade-1.21.1-NeoForge-15.10.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1ykPSy1GKtTQoCoe-AbhZFEqbPq9jm4D1&export=download&confirm=t"
		},
		{
			"name": "jei-1.21.1-neoforge-19.21.0.247.jar",
			"url": "https://drive.usercontent.google.com/download?id=1oVFS8-g_6hScG6KkP8wwDUNTEuQBSGEF&export=download&confirm=t"
		},
		{
			"name": "kanrommon-neoforge-1.21-1.21.0.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Fr5hqfo6YnvnlN0cZgAsXbBsd6QLoj1f&export=download&confirm=t"
		},
		{
			"name": "knightlib-neoforge-1.21-1.2.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1LOmn2O_oV3YQ7BdfF1rlmXl2Dvm6qTrN&export=download&confirm=t"
		},
		{
			"name": "knightquest-neoforge-1.21-1.8.6.jar",
			"url": "https://drive.usercontent.google.com/download?id=1hAjpPHpSz8Ar6GApvzsBsXKAJjyFHJTz&export=download&confirm=t"
		},
		{
			"name": "konkrete_neoforge_1.9.9_MC_1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=1tQK1Av0_r5KJORQzUQsq0bKwFJy-Xrru&export=download&confirm=t"
		},
		{
			"name": "kotlinforforge-5.8.0-all.jar",
			"url": "https://drive.usercontent.google.com/download?id=1ou0rZmZ6oKnIAAAmG7eMv9KJiRQP-nwz&export=download&confirm=t"
		},
		{
			"name": "mcw-bridges-3.1.1-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1h92wpApYZ5F9kaHTqLhJk3I2qROzKfcL&export=download&confirm=t"
		},
		{
			"name": "mcw-doors-1.1.2-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1fVkGq8y8nEEGm0Oqm-iY4h-JZJmBKFvC&export=download&confirm=t"
		},
		{
			"name": "mcw-fences-1.2.0-1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1rLhlxyEzQ9RFW6PBUmXRqSNRShGg73Qb&export=download&confirm=t"
		},
		{
			"name": "mcw-furniture-3.3.0-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1taeptCB5cIvJscTfstQSMp-4A8hXgyye&export=download&confirm=t"
		},
		{
			"name": "mcw-holidays-1.1.0-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1iHIoCv05u78ZX8RLmzGtaAFEHwx-jNW8&export=download&confirm=t"
		},
		{
			"name": "mcw-lights-1.1.2-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1k9O1fXQvlJ62i4Jp2uSXXUvSUu7fJ_Gl&export=download&confirm=t"
		},
		{
			"name": "mcw-paths-1.1.0neoforge-mc1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1YbUzvBbDRDAROYU6PweS35pM3O3OC48x&export=download&confirm=t"
		},
		{
			"name": "mcw-roofs-2.3.2-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1AUkYfHB6Skrjx5ArhSdf0ByK90YCl21g&export=download&confirm=t"
		},
		{
			"name": "mcw-stairs-1.0.1-1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1l-ILFGyc7E1qCO8q8T5B9Z67FRgjyV5k&export=download&confirm=t"
		},
		{
			"name": "mcw-trapdoors-1.1.4-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1iOVgyzjjfeard9bpRYRdJM94v3Hb6K8m&export=download&confirm=t"
		},
		{
			"name": "mcw-windows-2.3.0-mc1.21.1neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1jDDAZFxmp4Nph7XyR91HEaj3UtHH9AaL&export=download&confirm=t"
		},
		{
			"name": "Mekanism-1.21.1-10.7.14.79.jar",
			"url": "https://drive.usercontent.google.com/download?id=1HG3r4h-VpI71iQ1_r_M8wtEXZ_BaH1re&export=download&confirm=t"
		},
		{
			"name": "mekanismcovers-1.3-BETA+1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Mdxc_IiLnjhv46_eO50gto-ioDxjylek&export=download&confirm=t"
		},
		{
			"name": "MekanismGenerators-1.21.1-10.7.14.79.jar",
			"url": "https://drive.usercontent.google.com/download?id=1olI2StTe22rJljijmiCRz0a7DGama160&export=download&confirm=t"
		},
		{
			"name": "MekanismTools-1.21.1-10.7.14.79.jar",
			"url": "https://drive.usercontent.google.com/download?id=1xZuJAbUOrJfeYX3ExpR_rZaVvSbcVNay&export=download&confirm=t"
		},
		{
			"name": "melody_neoforge_1.0.10_MC_1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=169PnseH0VWofnnfKLN53C2Ca697LBwqn&export=download&confirm=t"
		},
		{
			"name": "minecolonies-1.1.972-1.21.1-snapshot.jar",
			"url": "https://drive.usercontent.google.com/download?id=1ftAjZoA-vx00Nr1hf3AOGxb3-4YheOaL&export=download&confirm=t"
		},
		{
			"name": "moonlight-1.21-2.18.13-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1gTOu38gtVbw_posiIPGNHyBsEOxcGJSj&export=download&confirm=t"
		},
		{
			"name": "MutantMonsters-v21.1.0-1.21.1-NeoForge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1IQkpz0Ew00OHSxCRVMZrD6YZNUu_ieem&export=download&confirm=t"
		},
		{
			"name": "NeoAuth-1.21.1-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1tuTkt-0qQyfQZXn3yzJVahlpGNt7BQEa&export=download&confirm=t"
		},
		{
			"name": "neoncraft-1.1.1-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1C_Wu-HfwMckvnyNFj8Pelca0ansX32xh&export=download&confirm=t"
		},
		{
			"name": "no-tnt-griefing-1.21.1-1.0.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1XUGWWvnc3AGposs0jTYGMN2lzlOPn8Om&export=download&confirm=t"
		},
		{
			"name": "owo-lib-neoforge-0.12.15.1-beta.3+1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=1OLFsqGMA5L9HxhBl09gRNhquDxLzzMOP&export=download&confirm=t"
		},
		{
			"name": "pipeorgans-0.6.1+1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1uvSs_k5zPtA5YL6jzCIHo1dkx8o80xP8&export=download&confirm=t"
		},
		{
			"name": "platform-neoforge-1.21.1-1.2.9.jar",
			"url": "https://drive.usercontent.google.com/download?id=1QtvYGlH6-oeAwRhq8GEnM4jtEst3yC-h&export=download&confirm=t"
		},
		{
			"name": "pointblank-neoforge-1.21-1.9.6.jar",
			"url": "https://drive.usercontent.google.com/download?id=1uKZ2zBIBLHLkVFAA0NOUQjHQgBoFGWOL&export=download&confirm=t"
		},
		{
			"name": "policemod-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1lxPqVHPEQekLSBUKVZa7Ga5dWsbKYBGG&export=download&confirm=t"
		},
		{
			"name": "pottery-1.0.2a-neoforge-mc1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=12fgPiCrpOAwmVKdMe7VktIuwk7gO1BMW&export=download&confirm=t"
		},
		{
			"name": "PuzzlesLib-v21.1.36-1.21.1-NeoForge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1g7P8vdvNOgPbnFGqgRQU2BXFycBhoKW1&export=download&confirm=t"
		},
		{
			"name": "reeses-sodium-options-neoforge-1.8.3+mc1.21.4.jar",
			"url": "https://drive.usercontent.google.com/download?id=191mKmtsVNY7-wlSzYsu6TuBhjJ-jnG12&export=download&confirm=t"
		},
		{
			"name": "refinedstorage-curios-integration-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=14tSe1Wv6nhb_mHtsh1zJZ-VFK-d5wOGJ&export=download&confirm=t"
		},
		{
			"name": "refinedstorage-jei-integration-neoforge-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1aAc-aM707cn2DTwqFBkc1S9h2OYFkqSZ&export=download&confirm=t"
		},
		{
			"name": "refinedstorage-mekanism-integration-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1t-RyqYMiQF_xAS9eKrORW5R9DA6oAc-n&export=download&confirm=t"
		},
		{
			"name": "refinedstorage-neoforge-2.0.0-beta.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1V1CkTLNRpcxjZEZgWeAm7rQ7fuAdodcO&export=download&confirm=t"
		},
		{
			"name": "refinedstorage-quartz-arsenal-neoforge-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1U1Cz5HKq_j8CroxhjiFA6khXbEWF8Pth&export=download&confirm=t"
		},
		{
			"name": "refurbished_furniture-neoforge-1.21.1-1.0.12.jar",
			"url": "https://drive.usercontent.google.com/download?id=1qdL56GzZnyEiIPhQzgSM5_RiD4_rktQh&export=download&confirm=t"
		},
		{
			"name": "regions_unexplored-neoforge-1.21.1-0.5.6.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1lwFWCm8uPtDojir8e940WHhK_CMwuRiT&export=download&confirm=t"
		},
		{
			"name": "reptilian-1.1.0-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1md81xpCJFUz6Ysys7Fkjl26gSfPrUfc2&export=download&confirm=t"
		},
		{
			"name": "repurposed_structures-7.5.15+1.21.1-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=13JpCMnmbdHhxbAPZ65jAXJd6PRpzuMM_&export=download&confirm=t"
		},
		{
			"name": "resourcefulconfig-neoforge-1.21-3.0.11.jar",
			"url": "https://drive.usercontent.google.com/download?id=1egcyh_EtRUXs7gfBNicZkbmnDd25MYQJ&export=download&confirm=t"
		},
		{
			"name": "resourcefullib-neoforge-1.21-3.0.12.jar",
			"url": "https://drive.usercontent.google.com/download?id=1cuO2wvZQsNRuj4Thzqy1YtU-SrcRypdy&export=download&confirm=t"
		},
		{
			"name": "rottencreatures-neoforge-1.21.1-1.1.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1VOO-XgUS7h2_xVYOC-45tvdLr11RT1FC&export=download&confirm=t"
		},
		{
			"name": "selfexpression_slim-1.5-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1IzrVtgZyH--FdCwYkZzw_acyclgcg1WL&export=download&confirm=t"
		},
		{
			"name": "selfexpression-2.21.2-neoforge-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1R71QNuyBSoUnEroUK7lVX95fAapdVa17&export=download&confirm=t"
		},
		{
			"name": "simplehats-neoforge-1.21.1-0.4.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=11cuYbqxrve7cKRU4lwEWNoGnexShMaRa&export=download&confirm=t"
		},
		{
			"name": "simpleplanes-1.21.1-5.3.6.jar",
			"url": "https://drive.usercontent.google.com/download?id=1fN77DKAz4VoIBxXqkh2YIqHQDJBTTFYc&export=download&confirm=t"
		},
		{
			"name": "skinrestorer-2.3.1+1.21-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Q-pC7LbGelVQNVGuG0ty-J45nDInRkXg&export=download&confirm=t"
		},
		{
			"name": "sodium-neoforge-0.6.9+mc1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1BB6UMXtHh7CxYL95TmIa0ucZGBHa2kMT&export=download&confirm=t"
		},
		{
			"name": "sodiumdynamiclights-neoforge-1.0.10-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=16O76YBr763h0F2ZwK4NPelY3k80zaEj4&export=download&confirm=t"
		},
		{
			"name": "sodiumoptionsapi-neoforge-1.0.10-1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1XRH3qVtTtGynOEchxv1D6v12vNvXmkEh&export=download&confirm=t"
		},
		{
			"name": "sophisticatedbackpacks-1.21.1-3.23.3.1191.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Qmgqx-ZozQU_JcScESAvVULPkClQP7LN&export=download&confirm=t"
		},
		{
			"name": "sophisticatedcore-1.21.1-1.2.6.856.jar",
			"url": "https://drive.usercontent.google.com/download?id=1S-TUeuU3EnOV01qUis_V1Weg0IKO7RAE&export=download&confirm=t"
		},
		{
			"name": "sophisticatedstorage-1.21.1-1.3.3.1057.jar",
			"url": "https://drive.usercontent.google.com/download?id=1RUpj2iiFFDhgMXMrThId3v16PDX0adss&export=download&confirm=t"
		},
		{
			"name": "spark-1.10.124-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Cr8j90bdnAc9lTiBwJFaIv8ZO3t8Q0cu&export=download&confirm=t"
		},
		{
			"name": "splinecart-0.3.1+1.21.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1R-eA-UV9QenkzbSSIzLPL7KUzcw0smRy&export=download&confirm=t"
		},
		{
			"name": "StrawStatues-v21.1.0-1.21.1-NeoForge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1oAVyd_SGctIBQaiE8VomoeIXJ7hHaySV&export=download&confirm=t"
		},
		{
			"name": "Structory_1.21.x_v1.3.10.jar",
			"url": "https://drive.usercontent.google.com/download?id=1q8u1YGlBcOp-RqVbQR2L7pBl-E6ngBm4&export=download&confirm=t"
		},
		{
			"name": "Structory_Towers_1.21.x_v1.0.11.jar",
			"url": "https://drive.usercontent.google.com/download?id=1lPGMw2AP5ocvhtSRxbxrXWArfKUZBrSO&export=download&confirm=t"
		},
		{
			"name": "structurize-1.0.774-1.21.1-snapshot.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Si_FeIsdYgedACrxEuFAeR--YPd9ZTRD&export=download&confirm=t"
		},
		{
			"name": "supermartijn642configlib-1.1.8-neoforge-mc1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=18PwtSj27f0ICsik0JAZaRQSwhoGiuoCm&export=download&confirm=t"
		},
		{
			"name": "supermartijn642corelib-1.1.18a-neoforge-mc1.21.jar",
			"url": "https://drive.usercontent.google.com/download?id=1CARkGEU3fWvlqzCgoJUOkkkpig-vxWC0&export=download&confirm=t"
		},
		{
			"name": "supplementaries-1.21-3.1.8-neoforge.jar",
			"url": "https://drive.usercontent.google.com/download?id=1JOEqhzBEcw0F2w6IWSVw5KybNMhmOu09&export=download&confirm=t"
		},
		{
			"name": "TerraBlender-neoforge-1.21.1-4.1.0.8.jar",
			"url": "https://drive.usercontent.google.com/download?id=1RSOsp7KCYWJyQQKZjyjtc6fxQ9EaTEH8&export=download&confirm=t"
		},
		{
			"name": "toms_storage-1.21-2.1.3.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Vp4RegVeUFQya0_sIZ5NjW0I6DhYDxv_&export=download&confirm=t"
		},
		{
			"name": "voicechat-neoforge-1.21.1-2.5.28.jar",
			"url": "https://drive.usercontent.google.com/download?id=1268p9Yb-hp4hWNp2HnSzMSpmMHL_gQCP&export=download&confirm=t"
		},
		{
			"name": "walkers-5.7.jar",
			"url": "https://drive.usercontent.google.com/download?id=1PjqRbYM9BqXugkjBXci9gjzMiJLNz3Ie&export=download&confirm=t"
		},
		{
			"name": "waterframes-NEOFORGE-mc1.21.1-v2.1.14.jar",
			"url": "https://drive.usercontent.google.com/download?id=1x7ZmjOfwtfDDsEBTI1JLdo_igPXTmBqd&export=download&confirm=t"
		},
		{
			"name": "watermedia-2.1.24.jar",
			"url": "https://drive.usercontent.google.com/download?id=1HyAin89xQ1tUSFyiJ1CpBxy5rR2aYy0m&export=download&confirm=t"
		},
		{
			"name": "worldedit-mod-7.3.8.jar",
			"url": "https://drive.usercontent.google.com/download?id=1jUGAGxTvFzr_9UQPa7e_JdZ9_xNk5w0A&export=download&confirm=t"
		},
		{
			"name": "xercamusic-1.21.1-1.0.0.jar",
			"url": "https://drive.usercontent.google.com/download?id=1H_xztx2phfjVGJyN6WGytRf5IsSziT2O&export=download&confirm=t"
		},
		{
			"name": "xercapaint-1.21.1-1.0.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1mata-G-wEXoH49wLw85eK6_Cinkbu0W7&export=download&confirm=t"
		},
		{
			"name": "xtonesreworked-1.1.0-NF-1.21_21.0.167.jar",
			"url": "https://drive.usercontent.google.com/download?id=1A9pQ9UvhgH7UzHW7ZGD05KDgRe4hx0vQ&export=download&confirm=t"
		},
		{
			"name": "yawp-1.21.1-neoforge-0.5.2-beta4.jar",
			"url": "https://drive.usercontent.google.com/download?id=1igKy0404mAl_aqLD3Qg4s2-PAEm8qsD_&export=download&confirm=t"
		},
		{
			"name": "YungsApi-1.21.1-NeoForge-5.1.5.jar",
			"url": "https://drive.usercontent.google.com/download?id=14rQnoAb-uEqhIgmETcNnNYqg0ThQ7zEc&export=download&confirm=t"
		},
		{
			"name": "YungsBetterDesertTemples-1.21.1-NeoForge-4.1.5.jar",
			"url": "https://drive.usercontent.google.com/download?id=1pRjUGAX3DdH9p1hTzjPYJ4QpMvEQzYeW&export=download&confirm=t"
		},
		{
			"name": "YungsBetterDungeons-1.21.1-NeoForge-5.1.4.jar",
			"url": "https://drive.usercontent.google.com/download?id=1wnq9sgJ6CPGgj1aRaqmedbv2Vl36oFKY&export=download&confirm=t"
		},
		{
			"name": "YungsBetterEndIsland-1.21.1-NeoForge-3.1.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1Tv0ewb4_QwuELag6NeZFSh1uMonwICEw&export=download&confirm=t"
		},
		{
			"name": "YungsBetterJungleTemples-1.21.1-NeoForge-3.1.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1bIMJnp4xDmM4lXTL2xCJla1Hqp172EAX&export=download&confirm=t"
		},
		{
			"name": "YungsBetterMineshafts-1.21.1-NeoForge-5.1.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=1D0WpK_nYqyrg4jcbPtrVYoqOF8rJJeGg&export=download&confirm=t"
		},
		{
			"name": "YungsBetterNetherFortresses-1.21.1-NeoForge-3.1.4.jar",
			"url": "https://drive.usercontent.google.com/download?id=1rGlYRRwREp9h_7vAM4vIXWNrEXxM4MpP&export=download&confirm=t"
		},
		{
			"name": "YungsBetterOceanMonuments-1.21.1-NeoForge-4.1.2.jar",
			"url": "https://drive.usercontent.google.com/download?id=1fTPzkdxrmE8G0abjtU91Hd2enqedXKUr&export=download&confirm=t"
		},
		{
			"name": "YungsBetterStrongholds-1.21.1-NeoForge-5.1.3.jar",
			"url": "https://drive.usercontent.google.com/download?id=1umPrFi-rvY_A4R2ETyhIjYtLAP186rIv&export=download&confirm=t"
		},
		{
			"name": "YungsBetterWitchHuts-1.21.1-NeoForge-4.1.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=15-jNJnA-ePlfFihpxV8BxSIzxksUVloj&export=download&confirm=t"
		},
		{
			"name": "YungsExtras-1.21.1-NeoForge-5.1.1.jar",
			"url": "https://drive.usercontent.google.com/download?id=18dVwxEtP7KuTu7RZAfqGgdj2yXRyS1wa&export=download&confirm=t"
		}
	];
	modpack_default = {
		launcherName,
		packName,
		minecraft,
		loader,
		loaderVersion,
		maxRam: 10,
		minRam: 4,
		server,
		port,
		configs,
		mods
	};
}));
//#endregion
//#region src/main/index.js
var { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
var { autoUpdater } = require("electron-updater");
var { Client } = require("minecraft-launcher-core");
var path = require("path");
var fs = require("fs");
var https = require("https");
var http = require("http");
var net = require("net");
var crypto = require("crypto");
var { spawn } = require("child_process");
var MODPACK = (init_modpack(), __toCommonJS(modpack_exports).default);
var GAME_DIR = path.join(app.getPath("appData"), MODPACK.launcherName);
var SESSION_FILE = path.join(GAME_DIR, ".session");
var NEOFORGE_INSTALLER_URL = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${MODPACK.loaderVersion}/neoforge-${MODPACK.loaderVersion}-installer.jar`;
var NEOFORGE_INSTALLER_PATH = path.join(GAME_DIR, `neoforge-${MODPACK.loaderVersion}-installer.jar`);
var JAVA_MANIFEST_URL = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
var JAVA_RUNTIME_NAME = "java-runtime-delta";
var JAVA_DIR = path.join(GAME_DIR, "runtime", JAVA_RUNTIME_NAME);
var JAVA_EXE = path.join(JAVA_DIR, "bin", "javaw.exe");
var win = null;
var currentToken = null;
function createWindow() {
	win = new BrowserWindow({
		width: 1366,
		height: 883,
		resizable: false,
		frame: false,
		webPreferences: {
			preload: path.join(__dirname, "../preload/index.js"),
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	win.webContents.setZoomFactor(1);
	win.webContents.on("did-finish-load", () => {
		win.webContents.setZoomFactor(1366 / 1728);
	});
	if (process.env["ELECTRON_RENDERER_URL"]) win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	else win.loadFile(path.join(__dirname, "../renderer/index.html"));
	win.removeMenu();
}
var MC_SERVER_HOST = "109.239.153.124";
var MC_SERVER_PORT = 25965;
var PLAYER_TIMES_FILE = path.join(GAME_DIR, "player-times.json");
var PLAYERS_SEEN_FILE = path.join(GAME_DIR, "players-seen.json");
function loadPlayerTimes() {
	try {
		if (fs.existsSync(PLAYER_TIMES_FILE)) return JSON.parse(fs.readFileSync(PLAYER_TIMES_FILE, "utf8"));
	} catch (e) {}
	return {};
}
function savePlayerTimes(times) {
	try {
		fs.mkdirSync(path.dirname(PLAYER_TIMES_FILE), { recursive: true });
		fs.writeFileSync(PLAYER_TIMES_FILE, JSON.stringify(times));
	} catch (e) {}
}
function loadPlayersSeen() {
	try {
		if (fs.existsSync(PLAYERS_SEEN_FILE)) return JSON.parse(fs.readFileSync(PLAYERS_SEEN_FILE, "utf8"));
	} catch (e) {}
	return {};
}
function savePlayersSeen(seen) {
	try {
		fs.mkdirSync(path.dirname(PLAYERS_SEEN_FILE), { recursive: true });
		fs.writeFileSync(PLAYERS_SEEN_FILE, JSON.stringify(seen));
	} catch (e) {}
}
function mcVarIntWrite(value) {
	const bytes = [];
	value = value >>> 0;
	do {
		let byte = value & 127;
		value >>>= 7;
		if (value !== 0) byte |= 128;
		bytes.push(byte);
	} while (value !== 0);
	return Buffer.from(bytes);
}
function mcVarIntRead(buf, offset) {
	let result = 0, shift = 0, pos = offset;
	while (true) {
		if (pos >= buf.length) throw new Error("buf_short");
		const byte = buf[pos++];
		result |= (byte & 127) << shift;
		if ((byte & 128) === 0) break;
		shift += 7;
		if (shift >= 32) throw new Error("VarInt overflow");
	}
	return {
		value: result,
		newOffset: pos
	};
}
function mcStringWrite(str) {
	const encoded = Buffer.from(str, "utf8");
	return Buffer.concat([mcVarIntWrite(encoded.length), encoded]);
}
function pingMinecraftServer(host, port, timeout = 5e3) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({
			host,
			port
		});
		let resolved = false;
		let buf = Buffer.alloc(0);
		const done = (result) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			socket.destroy();
			resolve(result);
		};
		const fail = (err) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			socket.destroy();
			reject(err);
		};
		const timer = setTimeout(() => fail(/* @__PURE__ */ new Error("Timeout")), timeout);
		socket.once("connect", () => {
			const portBuf = Buffer.allocUnsafe(2);
			portBuf.writeUInt16BE(port);
			const handshakeData = Buffer.concat([
				mcVarIntWrite(0),
				mcVarIntWrite(47),
				mcStringWrite(host),
				portBuf,
				mcVarIntWrite(1)
			]);
			const handshake = Buffer.concat([mcVarIntWrite(handshakeData.length), handshakeData]);
			const statusData = mcVarIntWrite(0);
			const statusReq = Buffer.concat([mcVarIntWrite(statusData.length), statusData]);
			socket.write(Buffer.concat([handshake, statusReq]));
		});
		socket.on("data", (chunk) => {
			buf = Buffer.concat([buf, chunk]);
			try {
				const lenR = mcVarIntRead(buf, 0);
				if (buf.length < lenR.newOffset + lenR.value) return;
				const idR = mcVarIntRead(buf, lenR.newOffset);
				if (idR.value !== 0) {
					fail(/* @__PURE__ */ new Error(`Unexpected packet 0x${idR.value.toString(16)}`));
					return;
				}
				const strLenR = mcVarIntRead(buf, idR.newOffset);
				const strStart = strLenR.newOffset;
				const strEnd = strStart + strLenR.value;
				if (buf.length < strEnd) return;
				done(JSON.parse(buf.slice(strStart, strEnd).toString("utf8")));
			} catch (e) {
				if (e.message === "buf_short") return;
				fail(e);
			}
		});
		socket.on("error", fail);
		socket.on("close", () => {
			if (!resolved) fail(/* @__PURE__ */ new Error("Connexion fermée"));
		});
	});
}
ipcMain.handle("get-server-status", async () => {
	try {
		const status = await pingMinecraftServer(MC_SERVER_HOST, MC_SERVER_PORT);
		const currentNames = (status.players?.sample ?? []).filter((p) => p?.name).map((p) => p.name);
		const times = loadPlayerTimes();
		const now = Date.now();
		for (const name of Object.keys(times)) if (!currentNames.includes(name)) delete times[name];
		for (const name of currentNames) if (!times[name]) times[name] = now;
		savePlayerTimes(times);
		const seen = loadPlayersSeen();
		for (const name of currentNames) if (!seen[name]) seen[name] = now;
		savePlayersSeen(seen);
		return {
			online: status.players?.online ?? 0,
			max: status.players?.max ?? 0,
			players: currentNames.map((name) => ({
				name,
				since: times[name]
			}))
		};
	} catch (e) {
		return {
			online: 0,
			max: 0,
			players: [],
			error: e.message
		};
	}
});
ipcMain.handle("get-players-seen", () => {
	return Object.keys(loadPlayersSeen());
});
ipcMain.handle("window-minimize", () => win?.minimize());
ipcMain.handle("window-maximize", () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.handle("window-close", () => win?.close());
ipcMain.handle("open-external", (_, url) => shell.openExternal(url));
function sendUpdateStatus(payload) {
	if (win && !win.isDestroyed()) win.webContents.send("update-status", payload);
}
function setupAutoUpdater() {
	autoUpdater.allowPrerelease = app.getVersion().includes("-");
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.logger = console;
	autoUpdater.on("checking-for-update", () => sendUpdateStatus({ status: "checking" }));
	autoUpdater.on("update-available", (info) => sendUpdateStatus({
		status: "available",
		version: info?.version
	}));
	autoUpdater.on("update-not-available", () => sendUpdateStatus({ status: "not-available" }));
	autoUpdater.on("download-progress", (p) => sendUpdateStatus({
		status: "progress",
		percent: p.percent,
		transferred: p.transferred,
		total: p.total,
		bytesPerSecond: p.bytesPerSecond
	}));
	autoUpdater.on("update-downloaded", (info) => sendUpdateStatus({
		status: "downloaded",
		version: info?.version
	}));
	autoUpdater.on("error", (err) => sendUpdateStatus({
		status: "error",
		message: String(err?.message || err)
	}));
}
ipcMain.handle("check-for-updates", async () => {
	if (!app.isPackaged) return { status: "disabled" };
	try {
		await autoUpdater.checkForUpdates();
		return { status: "checking" };
	} catch (e) {
		return {
			status: "error",
			message: String(e?.message || e)
		};
	}
});
var updateInstalling = false;
ipcMain.handle("quit-and-install", () => {
	if (updateInstalling) return;
	updateInstalling = true;
	autoUpdater.quitAndInstall(true, true);
});
app.whenReady().then(() => {
	loadSession();
	initializeAdmins();
	setupAutoUpdater();
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
function loadSession() {
	try {
		if (fs.existsSync(SESSION_FILE)) {
			const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
			currentToken = data.token;
			return data.username;
		}
	} catch (e) {}
	return null;
}
function saveSession(token) {
	fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
	fs.writeFileSync(SESSION_FILE, JSON.stringify({
		token,
		username: token.name
	}));
}
function clearSession() {
	currentToken = null;
	if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}
ipcMain.handle("get-session", () => {
	const username = loadSession();
	if (!username) return { logged: false };
	return {
		logged: true,
		username,
		uuid: currentToken?.uuid ?? null
	};
});
ipcMain.handle("login", async () => {
	try {
		const token = await exchangeCodeForMinecraftToken(await openMicrosoftLogin());
		currentToken = token;
		saveSession(token);
		return {
			success: true,
			username: token.name,
			uuid: token.uuid
		};
	} catch (e) {
		return {
			success: false,
			error: String(e.message || e)
		};
	}
});
function openMicrosoftLogin() {
	return new Promise((resolve, reject) => {
		const CLIENT_ID = "00000000402b5328";
		const REDIRECT = "https://login.live.com/oauth20_desktop.srf";
		const AUTH_URL = `https://login.live.com/oauth20_authorize.srf?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent("service::user.auth.xboxlive.com::MBI_SSL")}&prompt=select_account`;
		const authWin = new BrowserWindow({
			width: 500,
			height: 650,
			title: "Connexion Microsoft",
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true
			}
		});
		authWin.loadURL(AUTH_URL);
		authWin.removeMenu();
		let resolved = false;
		const tryCapture = (url) => {
			if (!url.startsWith(REDIRECT) || resolved) return;
			resolved = true;
			authWin.destroy();
			const params = new URL(url).searchParams;
			const err = params.get("error");
			const code = params.get("code");
			if (err) reject(new Error(err));
			else if (code) resolve(code);
			else reject(/* @__PURE__ */ new Error("Pas de code dans la réponse"));
		};
		authWin.webContents.on("will-redirect", (_, url) => tryCapture(url));
		authWin.webContents.on("will-navigate", (_, url) => tryCapture(url));
		authWin.on("closed", () => {
			if (!resolved) reject(/* @__PURE__ */ new Error("Login annulé"));
		});
	});
}
function httpsPost(url, body, extraHeaders = {}) {
	return new Promise((resolve, reject) => {
		const isJson = typeof body === "object";
		const payload = isJson ? JSON.stringify(body) : body;
		const urlObj = new URL(url);
		const options = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method: "POST",
			headers: {
				"Content-Type": isJson ? "application/json" : "application/x-www-form-urlencoded",
				"Content-Length": Buffer.byteLength(payload),
				"Accept": "application/json",
				...extraHeaders
			}
		};
		const req = https.request(options, (res) => {
			let data = "";
			res.on("data", (c) => data += c);
			res.on("end", () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					resolve(data);
				}
			});
		});
		req.on("error", reject);
		req.write(payload);
		req.end();
	});
}
function httpsGet(url, headers = {}) {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		https.get({
			hostname: urlObj.hostname,
			path: urlObj.pathname,
			headers
		}, (res) => {
			let data = "";
			res.on("data", (c) => data += c);
			res.on("end", () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					resolve(data);
				}
			});
		}).on("error", reject);
	});
}
async function exchangeCodeForMinecraftToken(code) {
	const ms = await httpsPost("https://login.live.com/oauth20_token.srf", `client_id=00000000402b5328&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent("https://login.live.com/oauth20_desktop.srf")}`);
	if (!ms.access_token) throw new Error("Échec token Microsoft : " + JSON.stringify(ms));
	const xsts = await httpsPost("https://xsts.auth.xboxlive.com/xsts/authorize", {
		Properties: {
			SandboxId: "RETAIL",
			UserTokens: [(await httpsPost("https://user.auth.xboxlive.com/user/authenticate", {
				Properties: {
					AuthMethod: "RPS",
					SiteName: "user.auth.xboxlive.com",
					RpsTicket: ms.access_token
				},
				RelyingParty: "http://auth.xboxlive.com",
				TokenType: "JWT"
			})).Token]
		},
		RelyingParty: "rp://api.minecraftservices.com/",
		TokenType: "JWT"
	});
	if (xsts.XErr) throw new Error(`Erreur XSTS ${xsts.XErr} — compte Xbox requis`);
	const uhs = xsts.DisplayClaims.xui[0].uhs;
	const mc = await httpsPost("https://api.minecraftservices.com/authentication/login_with_xbox", { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` });
	if (!mc.access_token) throw new Error("Échec token Minecraft");
	const profile = await httpsGet("https://api.minecraftservices.com/minecraft/profile", { Authorization: `Bearer ${mc.access_token}` });
	if (!profile.name) throw new Error("Profil Minecraft introuvable — le compte a-t-il Minecraft ?");
	return {
		access_token: mc.access_token,
		client_token: crypto.randomUUID(),
		uuid: profile.id,
		name: profile.name,
		user_properties: "{}"
	};
}
ipcMain.handle("logout", () => {
	clearSession();
	return { success: true };
});
var MC_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";
var MC_SKINS_URL = "https://api.minecraftservices.com/minecraft/profile/skins";
function mcAuthorizedRequest(method, url, { token, body, contentType } = {}) {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const headers = {
			Accept: "application/json",
			Authorization: `Bearer ${token}`
		};
		if (body) {
			headers["Content-Type"] = contentType;
			headers["Content-Length"] = body.length;
		}
		const req = https.request({
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method,
			headers
		}, (res) => {
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				let json = null;
				try {
					json = JSON.parse(text);
				} catch {}
				resolve({
					statusCode: res.statusCode,
					json,
					text
				});
			});
		});
		req.on("error", reject);
		req.setTimeout(15e3, () => req.destroy(/* @__PURE__ */ new Error("Délai réseau dépassé — réessaie.")));
		if (body) req.write(body);
		req.end();
	});
}
function buildSkinMultipart(variant, pngBuffer, boundary) {
	const head = `--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`;
	const tail = `\r\n--${boundary}--\r\n`;
	return Buffer.concat([
		Buffer.from(head, "utf8"),
		pngBuffer,
		Buffer.from(tail, "utf8")
	]);
}
function pngDimensions(buf) {
	const sig = [
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	];
	if (buf.length < 24) return null;
	for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
	if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
	return {
		width: buf.readUInt32BE(16),
		height: buf.readUInt32BE(20)
	};
}
function isValidSkinSize(dim) {
	return !!dim && dim.width === 64 && (dim.height === 64 || dim.height === 32);
}
function normalizeVariant(v) {
	return String(v || "classic").toLowerCase() === "slim" ? "slim" : "classic";
}
function activeSkin(profileJson) {
	const skins = profileJson?.skins || [];
	return skins.find((s) => s.state === "ACTIVE") || skins[0] || null;
}
ipcMain.handle("get-skin-info", async () => {
	if (!currentToken?.access_token) return {
		success: false,
		error: "Non connecté",
		loggedOut: true
	};
	try {
		const res = await mcAuthorizedRequest("GET", MC_PROFILE_URL, { token: currentToken.access_token });
		if (res.statusCode === 401) return {
			success: false,
			error: "Session expirée",
			expired: true
		};
		if (res.statusCode !== 200 || !res.json) return {
			success: false,
			error: `Erreur API (HTTP ${res.statusCode})`
		};
		const skin = activeSkin(res.json);
		return {
			success: true,
			variant: normalizeVariant(skin?.variant),
			skinUrl: skin?.url || null,
			name: res.json.name,
			uuid: res.json.id
		};
	} catch (e) {
		return {
			success: false,
			error: String(e.message || e)
		};
	}
});
ipcMain.handle("pick-skin-file", async () => {
	const result = await dialog.showOpenDialog(win, {
		title: "Choisir un skin Minecraft",
		properties: ["openFile"],
		filters: [{
			name: "Skin Minecraft (PNG)",
			extensions: ["png"]
		}]
	});
	if (result.canceled || !result.filePaths?.length) return { canceled: true };
	const filePath = result.filePaths[0];
	try {
		const buf = fs.readFileSync(filePath);
		const dim = pngDimensions(buf);
		if (!dim) return {
			canceled: false,
			error: "Ce fichier n'est pas un PNG valide."
		};
		if (!isValidSkinSize(dim)) return {
			canceled: false,
			error: `Un skin doit faire 64×64 px (ou 64×32). Détecté : ${dim.width}×${dim.height}.`
		};
		return {
			canceled: false,
			path: filePath,
			name: path.basename(filePath),
			dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
			width: dim.width,
			height: dim.height
		};
	} catch (e) {
		return {
			canceled: false,
			error: "Lecture du fichier impossible : " + e.message
		};
	}
});
ipcMain.handle("upload-skin", async (_, { variant, path: filePath } = {}) => {
	if (!currentToken?.access_token) return {
		success: false,
		error: "Non connecté",
		loggedOut: true
	};
	const v = normalizeVariant(variant);
	let buf;
	try {
		buf = fs.readFileSync(filePath);
	} catch {
		return {
			success: false,
			error: "Impossible de lire le fichier (déplacé ou supprimé ?)."
		};
	}
	if (!isValidSkinSize(pngDimensions(buf))) return {
		success: false,
		error: "Le skin doit être un PNG de 64×64 pixels."
	};
	const boundary = "----RawLauncherSkin" + crypto.randomUUID().replace(/-/g, "");
	const body = buildSkinMultipart(v, buf, boundary);
	try {
		const res = await mcAuthorizedRequest("POST", MC_SKINS_URL, {
			token: currentToken.access_token,
			body,
			contentType: `multipart/form-data; boundary=${boundary}`
		});
		if (res.statusCode === 401) return {
			success: false,
			error: "Session Minecraft expirée — reconnecte-toi.",
			expired: true
		};
		if (res.statusCode !== 200) return {
			success: false,
			error: `Échec de l'envoi (HTTP ${res.statusCode}). ${(res.text || "").slice(0, 160)}`
		};
		const skin = activeSkin(res.json);
		return {
			success: true,
			variant: normalizeVariant(skin?.variant) || v,
			skinUrl: skin?.url || null
		};
	} catch (e) {
		return {
			success: false,
			error: String(e.message || e)
		};
	}
});
ipcMain.handle("reset-skin", async () => {
	if (!currentToken?.access_token) return {
		success: false,
		error: "Non connecté",
		loggedOut: true
	};
	try {
		const res = await mcAuthorizedRequest("DELETE", `${MC_SKINS_URL}/active`, { token: currentToken.access_token });
		if (res.statusCode === 401) return {
			success: false,
			error: "Session Minecraft expirée — reconnecte-toi.",
			expired: true
		};
		if (res.statusCode !== 200) return {
			success: false,
			error: `Échec de la réinitialisation (HTTP ${res.statusCode}).`
		};
		const skin = activeSkin(res.json);
		return {
			success: true,
			variant: normalizeVariant(skin?.variant),
			skinUrl: skin?.url || null
		};
	} catch (e) {
		return {
			success: false,
			error: String(e.message || e)
		};
	}
});
ipcMain.handle("check-modpack", async () => {
	const modsDir = path.join(GAME_DIR, "mods");
	fs.mkdirSync(modsDir, { recursive: true });
	const knownMods = new Set(MODPACK.mods.map((m) => m.name));
	for (const file of fs.readdirSync(modsDir)) {
		if (knownMods.has(file)) continue;
		if (file.startsWith(".")) continue;
		const fullPath = path.join(modsDir, file);
		try {
			if (fs.statSync(fullPath).isDirectory()) continue;
			fs.unlinkSync(fullPath);
		} catch (e) {
			console.log(`[RawLauncher] Impossible de supprimer ${file} :`, e.message);
		}
	}
	const missingMods = MODPACK.mods.filter((mod) => !fs.existsSync(path.join(modsDir, mod.name)));
	const needsNeoForge = !isNeoForgeInstalled();
	return {
		total: MODPACK.mods.length,
		missingMods: missingMods.length,
		needsNeoForge
	};
});
ipcMain.handle("install-modpack", async () => {
	const modsDir = path.join(GAME_DIR, "mods");
	fs.mkdirSync(modsDir, { recursive: true });
	try {
		const javaExe = await ensureJava21();
		if (!isNeoForgeInstalled()) {
			win?.webContents.send("install-progress", {
				step: "neoforge",
				name: `Téléchargement NeoForge ${MODPACK.loaderVersion}...`,
				percent: 10
			});
			if (!fs.existsSync(NEOFORGE_INSTALLER_PATH)) await downloadFile(NEOFORGE_INSTALLER_URL, NEOFORGE_INSTALLER_PATH);
			const profilesPath = path.join(GAME_DIR, "launcher_profiles.json");
			if (!fs.existsSync(profilesPath)) {
				fs.mkdirSync(GAME_DIR, { recursive: true });
				fs.writeFileSync(profilesPath, JSON.stringify({
					profiles: {},
					selectedProfile: "(Default)",
					clientToken: crypto.randomUUID(),
					authenticationDatabase: {},
					launcherVersion: {
						name: "1.0.0",
						format: 21
					}
				}, null, 2));
			}
			win?.webContents.send("install-progress", {
				step: "neoforge",
				name: `Installation NeoForge (peut prendre 2-5 min)...`,
				percent: 30
			});
			await new Promise((resolve, reject) => {
				const proc = spawn(javaExe, [
					"-jar",
					NEOFORGE_INSTALLER_PATH,
					"--installClient",
					GAME_DIR
				]);
				let output = "";
				proc.stdout?.on("data", (d) => {
					output += d.toString();
				});
				proc.stderr?.on("data", (d) => {
					output += d.toString();
				});
				let pct = 30;
				const tick = setInterval(() => {
					if (pct < 90) {
						pct += 2;
						win?.webContents.send("install-progress", {
							step: "neoforge",
							name: `Installation NeoForge (peut prendre 2-5 min)...`,
							percent: pct
						});
					}
				}, 3e3);
				proc.on("close", (code) => {
					clearInterval(tick);
					if (code === 0) resolve();
					else reject(/* @__PURE__ */ new Error(`Échec NeoForge (code ${code}).\n${output.slice(-400)}`));
				});
				proc.on("error", (err) => {
					clearInterval(tick);
					if (err.code === "ENOENT") reject(/* @__PURE__ */ new Error(`Java non trouvé (essayé : ${javaExe})`));
					else reject(err);
				});
			});
		}
		const missing = MODPACK.mods.filter((mod) => !fs.existsSync(path.join(modsDir, mod.name)));
		for (let i = 0; i < missing.length; i++) {
			const mod = missing[i];
			win?.webContents.send("install-progress", {
				step: "mods",
				current: i + 1,
				total: missing.length,
				name: mod.name,
				percent: Math.round(i / missing.length * 100)
			});
			await downloadFile(mod.url, path.join(modsDir, mod.name));
		}
		win?.webContents.send("install-progress", { done: true });
		return { success: true };
	} catch (e) {
		win?.webContents.send("install-progress", {
			error: true,
			message: e.message
		});
		return {
			success: false,
			error: e.message
		};
	}
});
function isNeoForgeInstalled() {
	const versionId = `neoforge-${MODPACK.loaderVersion}`;
	const versionDir = path.join(GAME_DIR, "versions", versionId);
	return fs.existsSync(versionDir);
}
function findJavaExecutable() {
	const baseDirs = [path.join(app.getPath("appData"), ".minecraft", "runtime"), path.join(GAME_DIR, "runtime")];
	for (const base of baseDirs) {
		if (!fs.existsSync(base)) continue;
		const entries = fs.readdirSync(base).sort().reverse();
		for (const name of entries) for (const exe of ["javaw.exe", "java.exe"]) {
			const c1 = path.join(base, name, "windows-x64", name, "bin", exe);
			if (fs.existsSync(c1)) return c1;
			const c2 = path.join(base, name, "bin", exe);
			if (fs.existsSync(c2)) return c2;
		}
	}
	return "java";
}
async function ensureJava21() {
	if (fs.existsSync(JAVA_EXE)) return JAVA_EXE;
	const existing = findJavaExecutable();
	if (existing !== "java") return existing;
	win?.webContents.send("install-progress", {
		step: "java",
		name: "Préparation : téléchargement de Java 21...",
		percent: 2
	});
	const entries = (await httpsGet(JAVA_MANIFEST_URL))?.["windows-x64"]?.[JAVA_RUNTIME_NAME];
	if (!entries || !entries[0]) throw new Error("Runtime Java 21 introuvable (manifest Mojang)");
	const manifest = await httpsGet(entries[0].manifest.url);
	const files = Object.entries(manifest.files).filter(([_, f]) => f.type === "file");
	let done = 0;
	for (const [relPath, info] of files) {
		const dest = path.join(JAVA_DIR, relPath);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		await downloadFile(info.downloads.raw.url, dest);
		done++;
		if (done % 5 === 0 || done === files.length) win?.webContents.send("install-progress", {
			step: "java",
			name: `Téléchargement de Java 21... (${done}/${files.length})`,
			percent: 2 + Math.round(done / files.length * 28)
		});
	}
	return JAVA_EXE;
}
function libRuleAllows(rules) {
	if (!rules || rules.length === 0) return true;
	let result = false;
	for (const rule of rules) {
		let applies = true;
		if (rule.os && rule.os.name && rule.os.name !== "windows") applies = false;
		if (applies) result = rule.action === "allow";
	}
	return result;
}
function libNameToPath(name) {
	const parts = name.split(":");
	if (parts.length < 3) return null;
	const [group, artifact, version, classifier] = parts;
	const file = `${artifact}-${version}${classifier ? "-" + classifier : ""}.jar`;
	return path.join(group.replace(/\./g, "/"), artifact, version, file);
}
function collectLibraryPaths(libraries) {
	const out = [];
	for (const lib of libraries || []) {
		if (!lib.name) continue;
		if (!libRuleAllows(lib.rules)) continue;
		if (lib.name.includes(":natives")) continue;
		const rel = libNameToPath(lib.name);
		if (!rel) continue;
		out.push(path.join(GAME_DIR, "libraries", rel));
	}
	return out;
}
function buildNeoForgeJvmArgs() {
	try {
		const vanillaJsonPath = path.join(GAME_DIR, "versions", MODPACK.minecraft, `${MODPACK.minecraft}.json`);
		const neoVersionId = `neoforge-${MODPACK.loaderVersion}`;
		const neoJsonPath = path.join(GAME_DIR, "versions", neoVersionId, `${neoVersionId}.json`);
		if (!fs.existsSync(vanillaJsonPath) || !fs.existsSync(neoJsonPath)) return null;
		const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, "utf8"));
		const neoJson = JSON.parse(fs.readFileSync(neoJsonPath, "utf8"));
		if (!Array.isArray(neoJson?.arguments?.jvm)) return null;
		const libraryDir = path.join(GAME_DIR, "libraries");
		const clientJar = path.join(GAME_DIR, "versions", MODPACK.minecraft, `${MODPACK.minecraft}.jar`);
		const cpEntries = [];
		for (const p of collectLibraryPaths(vanillaJson.libraries)) if (!cpEntries.includes(p)) cpEntries.push(p);
		for (const p of collectLibraryPaths(neoJson.libraries)) if (!cpEntries.includes(p)) cpEntries.push(p);
		if (fs.existsSync(clientJar)) cpEntries.push(clientJar);
		const vars = {
			"${library_directory}": libraryDir,
			"${classpath_separator}": ";",
			"${version_name}": neoVersionId,
			"${classpath}": cpEntries.join(";")
		};
		const substitute = (str) => {
			let out = str;
			for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
			return out;
		};
		const jvmArgs = [];
		for (const entry of neoJson.arguments.jvm) if (typeof entry === "string") jvmArgs.push(substitute(entry));
		else if (entry && typeof entry === "object") {
			if (!libRuleAllows(entry.rules)) continue;
			const values = Array.isArray(entry.value) ? entry.value : [entry.value];
			for (const v of values) jvmArgs.push(substitute(v));
		}
		return jvmArgs.length ? jvmArgs : null;
	} catch (e) {
		console.log("[RawLauncher] Impossible de reconstruire les args JVM NeoForge :", e.message);
		return null;
	}
}
ipcMain.handle("launch", async () => {
	if (!currentToken) return {
		success: false,
		error: "Non connecté"
	};
	const javaExe = await ensureJava21();
	const launcher = new Client();
	const neoForgeJvmArgs = buildNeoForgeJvmArgs();
	const opts = {
		authorization: currentToken,
		root: GAME_DIR,
		version: {
			number: MODPACK.minecraft,
			type: "release",
			custom: `neoforge-${MODPACK.loaderVersion}`
		},
		memory: {
			max: `${MODPACK.maxRam ?? 4}G`,
			min: `${MODPACK.minRam ?? 2}G`
		},
		javaPath: javaExe,
		customArgs: [...[
			"-XX:+UseG1GC",
			"-XX:+ParallelRefProcEnabled",
			"-XX:MaxGCPauseMillis=200",
			"-XX:+UnlockExperimentalVMOptions",
			"-XX:+DisableExplicitGC",
			"-XX:+AlwaysPreTouch",
			"-XX:G1NewSizePercent=30",
			"-XX:G1MaxNewSizePercent=40",
			"-XX:G1HeapRegionSize=8M",
			"-XX:G1ReservePercent=20",
			"-XX:G1HeapWastePercent=5",
			"-XX:G1MixedGCCountTarget=4",
			"-XX:InitiatingHeapOccupancyPercent=15",
			"-XX:G1MixedGCLiveThresholdPercent=90",
			"-XX:G1RSetUpdatingPauseTimePercent=5",
			"-XX:SurvivorRatio=32",
			"-XX:+PerfDisableSharedMem",
			"-XX:MaxTenuringThreshold=1"
		], ...neoForgeJvmArgs || [
			"--add-opens",
			"java.base/java.util.jar=cpw.mods.securejarhandler",
			"--add-opens",
			"java.base/java.lang.invoke=cpw.mods.securejarhandler",
			"--add-opens",
			"java.base/java.lang.invoke=ALL-UNNAMED",
			"--add-exports",
			"java.base/sun.security.util=cpw.mods.securejarhandler",
			"--add-exports",
			"jdk.naming.dns/com.sun.jndi.dns=java.naming"
		]]
	};
	let logBuffer = [];
	launcher.on("data", (e) => {
		const line = e.toString();
		logBuffer.push(line);
		if (logBuffer.length > 60) logBuffer.shift();
		win?.webContents.send("game-log", line);
	});
	launcher.on("progress", (e) => win?.webContents.send("launch-progress", e));
	launcher.on("debug", (e) => console.log("[MCLC debug]", e));
	launcher.on("close", (code) => {
		win?.show();
		win?.webContents.send("game-closed", {
			code,
			log: logBuffer.join("\n")
		});
	});
	try {
		const proc = await launcher.launch(opts);
		if (!proc || !proc.pid) return {
			success: false,
			error: "Minecraft n'a pas démarré (pas de PID)"
		};
		win?.hide();
		return { success: true };
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
var FIREBASE_DATABASE_URL = "https://zig-base-default-rtdb.europe-west1.firebasedatabase.app";
var FIREBASE_SECRET = "kC9FjebZUTe2rh6RPkjWWjx0YP6NIvXnbMmrOEgm";
function isFirebaseConfigured() {
	return FIREBASE_DATABASE_URL.startsWith("https://") && !FIREBASE_DATABASE_URL.includes("YOUR-PROJECT-ID") && !FIREBASE_SECRET.includes("YOUR-DATABASE-SECRET");
}
function firebaseRequest(method, fbPath, data, useAuth) {
	return new Promise((resolve, reject) => {
		let urlStr = `${FIREBASE_DATABASE_URL}${fbPath}.json`;
		if (useAuth) urlStr += `?auth=${encodeURIComponent(FIREBASE_SECRET)}`;
		const urlObj = new URL(urlStr);
		const payload = data !== null && data !== void 0 ? JSON.stringify(data) : null;
		const options = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method,
			headers: {
				"Accept": "application/json",
				...payload !== null ? {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload)
				} : {}
			}
		};
		const req = https.request(options, (res) => {
			let body = "";
			res.on("data", (c) => body += c);
			res.on("end", () => {
				try {
					resolve(JSON.parse(body));
				} catch {
					resolve(body || null);
				}
			});
		});
		req.on("error", reject);
		if (payload !== null) req.write(payload);
		req.end();
	});
}
async function initializeAdmins() {
	if (!isFirebaseConfigured()) return;
	try {
		const existing = await firebaseRequest("GET", "/admins", null, false);
		if (!existing || existing === "null") {
			await firebaseRequest("PUT", "/admins", { Mamazorus: true }, true);
			console.log("[Admin] Base admins initialisée avec Mamazorus");
		}
	} catch (e) {
		console.log("[Admin] Impossible d'initialiser les admins :", e.message);
	}
}
ipcMain.handle("get-firebase-status", () => ({ configured: isFirebaseConfigured() }));
ipcMain.handle("check-admin", async () => {
	if (!isFirebaseConfigured()) return { isAdmin: false };
	const username = loadSession();
	if (!username) return { isAdmin: false };
	try {
		return { isAdmin: await firebaseRequest("GET", `/admins/${username}`, null, false) === true };
	} catch {
		return { isAdmin: false };
	}
});
ipcMain.handle("get-news", async () => {
	if (!isFirebaseConfigured()) return {
		success: false,
		news: []
	};
	try {
		const data = await firebaseRequest("GET", "/news", null, false);
		if (!data || data === "null") return {
			success: true,
			news: []
		};
		const news = Object.entries(data).map(([id, item]) => ({
			id,
			...item
		}));
		news.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
		return {
			success: true,
			news
		};
	} catch (e) {
		return {
			success: false,
			news: [],
			error: e.message
		};
	}
});
ipcMain.handle("create-news", async (_, newsData) => {
	if (!isFirebaseConfigured()) return {
		success: false,
		error: "Firebase non configuré"
	};
	try {
		return {
			success: true,
			id: (await firebaseRequest("POST", "/news", {
				...newsData,
				createdAt: Date.now()
			}, true))?.name
		};
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
ipcMain.handle("update-news", async (_, { id, ...newsData }) => {
	if (!isFirebaseConfigured()) return {
		success: false,
		error: "Firebase non configuré"
	};
	try {
		await firebaseRequest("PATCH", `/news/${id}`, newsData, true);
		return { success: true };
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
ipcMain.handle("delete-news", async (_, id) => {
	if (!isFirebaseConfigured()) return {
		success: false,
		error: "Firebase non configuré"
	};
	try {
		await firebaseRequest("DELETE", `/news/${id}`, null, true);
		return { success: true };
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
ipcMain.handle("get-admins", async () => {
	if (!isFirebaseConfigured()) return {
		success: false,
		admins: {}
	};
	try {
		return {
			success: true,
			admins: await firebaseRequest("GET", "/admins", null, false) || {}
		};
	} catch (e) {
		return {
			success: false,
			admins: {},
			error: e.message
		};
	}
});
ipcMain.handle("add-admin", async (_, username) => {
	if (!isFirebaseConfigured()) return {
		success: false,
		error: "Firebase non configuré"
	};
	try {
		await firebaseRequest("PUT", `/admins/${username}`, true, true);
		return { success: true };
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
ipcMain.handle("remove-admin", async (_, username) => {
	if (!isFirebaseConfigured()) return {
		success: false,
		error: "Firebase non configuré"
	};
	try {
		await firebaseRequest("DELETE", `/admins/${username}`, null, true);
		return { success: true };
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
function downloadFile(url, dest, redirects = 0) {
	if (redirects > 10) return Promise.reject(/* @__PURE__ */ new Error("Trop de redirections"));
	return new Promise((resolve, reject) => {
		const proto = url.startsWith("https") ? https : http;
		const urlObj = new URL(url);
		const options = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			headers: { "User-Agent": "Mozilla/5.0" }
		};
		const file = fs.createWriteStream(dest);
		proto.get(options, (res) => {
			if ([
				301,
				302,
				303,
				307,
				308
			].includes(res.statusCode)) {
				file.close();
				if (fs.existsSync(dest)) fs.unlinkSync(dest);
				return downloadFile(res.headers.location, dest, redirects + 1).then(resolve).catch(reject);
			}
			if (res.statusCode !== 200) {
				file.close();
				if (fs.existsSync(dest)) fs.unlinkSync(dest);
				return reject(/* @__PURE__ */ new Error(`HTTP ${res.statusCode} — ${url}`));
			}
			if ((res.headers["content-type"] || "").includes("text/html")) {
				file.close();
				if (fs.existsSync(dest)) fs.unlinkSync(dest);
				return reject(/* @__PURE__ */ new Error(`Réponse HTML inattendue pour ${path.basename(dest)} — lien Drive expiré ?`));
			}
			res.pipe(file);
			file.on("finish", () => {
				file.close();
				resolve();
			});
		}).on("error", (err) => {
			file.close();
			if (fs.existsSync(dest)) fs.unlinkSync(dest);
			reject(err);
		});
	});
}
//#endregion
