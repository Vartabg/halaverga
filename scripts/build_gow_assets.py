#!/usr/bin/env python3
"""Pack Quaternius Universal Base Character (Superhero_Male + Beard + Long Hair + PBR maps)
and 18 Universal Animation Library clips into public/models/archangel-gow.glb."""

import copy, json, os, shutil, struct, subprocess, tempfile, zipfile

CHAR_ZIP = "/Users/vartny/Downloads/Universal Base Characters[Standard].zip"
ANIM_ZIP = "/Users/vartny/Downloads/Universal Animation Library[Standard].zip"
OUT_GLB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "models", "archangel-gow.glb")

KEEP_ANIMS = {
    "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Roll",
    "Jump_Start", "Jump_Loop", "Jump_Land",
    "Sword_Idle", "Sword_Attack", "Punch_Jab", "Punch_Cross",
    "Spell_Simple_Enter", "Spell_Simple_Idle_Loop", "Spell_Simple_Shoot",
    "Hit_Chest", "Hit_Head", "Death01",
}

def pad4(b: bytes, fill: bytes = b"\x00") -> bytes:
    rem = len(b) % 4
    return b if rem == 0 else b + fill * (4 - rem)

def append_bytes(buf: bytearray, data: bytes) -> tuple[int, int]:
    while len(buf) % 4 != 0:
        buf.append(0)
    offset = len(buf)
    buf.extend(data)
    return offset, len(data)

def resize_png(raw_bytes: bytes, max_dim: int, tmp_dir: str, tag: str) -> bytes:
    in_path = os.path.join(tmp_dir, f"in_{tag}.png")
    out_path = os.path.join(tmp_dir, f"out_{tag}.jpg")
    with open(in_path, "wb") as f:
        f.write(raw_bytes)
    subprocess.run(
        ["sips", "-Z", str(max_dim), "-s", "format", "jpeg", "-s", "formatOptions", "82", in_path, "--out", out_path],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    with open(out_path, "rb") as f:
        return f.read()

COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_CNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

def copy_accessor(src_gltf: dict, src_bin: bytes, acc_idx: int, dst_gltf: dict, dst_bin: bytearray, acc_cache: dict) -> int:
    if acc_idx in acc_cache:
        return acc_cache[acc_idx]
    acc = copy.deepcopy(src_gltf["accessors"][acc_idx])
    bv = src_gltf["bufferViews"][acc["bufferView"]]
    elem_bytes = COMP_SIZE[acc["componentType"]] * TYPE_CNT[acc["type"]]
    stride = bv.get("byteStride", elem_bytes)
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    length = (acc["count"] - 1) * stride + elem_bytes if acc["count"] > 0 else 0
    off, packed_len = append_bytes(dst_bin, src_bin[start : start + length])
    new_bv = {"buffer": 0, "byteOffset": off, "byteLength": packed_len}
    if "byteStride" in bv:
        new_bv["byteStride"] = bv["byteStride"]
    if "target" in bv:
        new_bv["target"] = bv["target"]
    bv_idx = len(dst_gltf["bufferViews"])
    dst_gltf["bufferViews"].append(new_bv)
    acc["bufferView"] = bv_idx
    acc.pop("byteOffset", None)
    new_idx = len(dst_gltf["accessors"])
    dst_gltf["accessors"].append(acc)
    acc_cache[acc_idx] = new_idx
    return new_idx

def append_mesh_part(src_gltf: dict, src_bin: bytes, dst_gltf: dict, dst_bin: bytearray, mat_idx: int, node_name: str):
    bv_cache = {}
    mesh = copy.deepcopy(src_gltf["meshes"][0])
    mesh["name"] = node_name
    for prim in mesh["primitives"]:
        prim["material"] = mat_idx
        for k, v in list(prim["attributes"].items()):
            prim["attributes"][k] = copy_accessor(src_gltf, src_bin, v, dst_gltf, dst_bin, bv_cache)
        if "indices" in prim:
            prim["indices"] = copy_accessor(src_gltf, src_bin, prim["indices"], dst_gltf, dst_bin, bv_cache)
    mesh_idx = len(dst_gltf["meshes"])
    dst_gltf["meshes"].append(mesh)
    node_idx = len(dst_gltf["nodes"])
    dst_gltf["nodes"].append({"mesh": mesh_idx, "name": node_name, "skin": 0})
    dst_gltf["nodes"][68]["children"].append(node_idx)

def main():
    tmp_dir = tempfile.mkdtemp(prefix="gow_glb_")
    try:
        with zipfile.ZipFile(CHAR_ZIP) as zc, zipfile.ZipFile(ANIM_ZIP) as za:
            base_dir = "Universal Base Characters[Standard]/Base Characters/Godot - UE/"
            tex_dir = "Universal Base Characters[Standard]/Base Characters/Textures/"
            hair_dir = "Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/"

            hero_gltf = json.loads(zc.read(base_dir + "Superhero_Male_FullBody.gltf").decode("utf-8"))
            hero_bin = bytearray(zc.read(base_dir + "Superhero_Male_FullBody.bin"))
            beard_gltf = json.loads(zc.read(hair_dir + "Hair_Beard.gltf").decode("utf-8"))
            beard_bin = zc.read(hair_dir + "Hair_Beard.bin")
            long_gltf = json.loads(zc.read(hair_dir + "Hair_Long.gltf").decode("utf-8"))
            long_bin = zc.read(hair_dir + "Hair_Long.bin")

            # Append Beard and Long Hair meshes rigged to skin 0 (using MI_Hair_1 material index 0)
            append_mesh_part(beard_gltf, beard_bin, hero_gltf, hero_bin, 0, "Hair_Beard")
            append_mesh_part(long_gltf, long_bin, hero_gltf, hero_bin, 0, "Hair_Long")

            # Pack resized PBR textures into binary bufferViews
            tex_map = {
                "T_Hair_1_Normal_png.png": (base_dir + "T_Hair_1_Normal.png", 512),
                "T_Hair_1_BaseColor.png": (base_dir + "T_Hair_1_BaseColor.png", 512),
                "T_Eye_Normal_png.png": (base_dir + "T_Eye_Normal.png", 256),
                "T_Eye_Brown.png": (base_dir + "T_Eye_Brown.png", 256),
                "T_Superhero_Male_Normal.png": (base_dir + "T_Superhero_Male_Normal.png", 512),
                "T_Superhero_Male_Dark.png": (tex_dir + "T_Superhero_Male_Ligh.png", 512),
                "T_Superhero_Male_Roughness.png": (base_dir + "T_Superhero_Male_Roughness.png", 512),
            }
            for idx, img in enumerate(hero_gltf["images"]):
                uri = img.get("uri", "")
                src_path, dim = tex_map.get(uri, (base_dir + uri, 512))
                jpg_bytes = resize_png(zc.read(src_path), dim, tmp_dir, str(idx))
                off, length = append_bytes(hero_bin, jpg_bytes)
                bv_idx = len(hero_gltf["bufferViews"])
                hero_gltf["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": length})
                img.pop("uri", None)
                img["bufferView"] = bv_idx
                img["mimeType"] = "image/jpeg"

            # Extract 18 animations from UAL1_Standard.glb
            glb = za.read("Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb")
            j_len, _ = struct.unpack("<II", glb[12:20])
            ual_gltf = json.loads(glb[20 : 20 + j_len].decode("utf-8"))
            b_start = 20 + j_len + 8
            ual_bin = glb[b_start:]

            hero_gltf["animations"] = []
            anim_bv_cache = {}
            for anim in ual_gltf.get("animations", []):
                if anim.get("name") not in KEEP_ANIMS:
                    continue
                new_anim = copy.deepcopy(anim)
                for sampler in new_anim["samplers"]:
                    sampler["input"] = copy_accessor(ual_gltf, ual_bin, sampler["input"], hero_gltf, hero_bin, anim_bv_cache)
                    sampler["output"] = copy_accessor(ual_gltf, ual_bin, sampler["output"], hero_gltf, hero_bin, anim_bv_cache)
                hero_gltf["animations"].append(new_anim)

            hero_gltf["buffers"] = [{"byteLength": len(hero_bin)}]
            json_bytes = pad4(json.dumps(hero_gltf, separators=(",", ":")).encode("utf-8"), b" ")
            bin_bytes = pad4(bytes(hero_bin), b"\x00")
            total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

            os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
            with open(OUT_GLB, "wb") as out:
                out.write(struct.pack("<III", 0x46546C67, 2, total_len))
                out.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
                out.write(json_bytes)
                out.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
                out.write(bin_bytes)
            print(f"Built {OUT_GLB}: {total_len / (1024*1024):.2f} MB, {len(hero_gltf['animations'])} animations, {len(hero_gltf['meshes'])} meshes")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
