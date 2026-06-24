package com.rawstudio.zigshop;

/**
 * Une offre de troc telle que stockée dans Firebase (/shop/days/{date}/{id} et
 * /shop/library/{id}) : donner {@code inputQty} × {@code input} au marchand,
 * recevoir {@code outputQty} × {@code output}. input/output = identifiants d'item
 * (ex. "minecraft:diamond").
 */
public record ShopOffer(String id, String input, int inputQty, String output, int outputQty) {}
