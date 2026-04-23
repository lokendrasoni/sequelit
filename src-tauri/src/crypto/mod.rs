use base64::{engine::general_purpose::STANDARD, Engine};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::rand::{SecureRandom as _, SystemRandom};

const NONCE_LEN: usize = 12;

pub fn encrypt(plaintext: &str, key: &[u8]) -> Result<String, String> {
    let rng = SystemRandom::new();
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill(&mut nonce_bytes).map_err(|_| "RNG failed".to_string())?;

    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| "Bad key".to_string())?;
    let sealing_key = LessSafeKey::new(unbound);
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);

    let mut buf = plaintext.as_bytes().to_vec();
    sealing_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut buf)
        .map_err(|_| "Encryption failed".to_string())?;

    let mut out = nonce_bytes.to_vec();
    out.extend_from_slice(&buf);
    Ok(STANDARD.encode(&out))
}

pub fn decrypt(encoded: &str, key: &[u8]) -> Result<String, String> {
    let data = STANDARD.decode(encoded).map_err(|_| "Bad base64".to_string())?;
    if data.len() < NONCE_LEN {
        return Err("Data too short".to_string());
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
        .map_err(|_| "Bad nonce".to_string())?;

    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| "Bad key".to_string())?;
    let opening_key = LessSafeKey::new(unbound);
    let mut buf = ciphertext.to_vec();
    let plain = opening_key
        .open_in_place(nonce, Aad::empty(), &mut buf)
        .map_err(|_| "Decryption failed".to_string())?;

    String::from_utf8(plain.to_vec()).map_err(|_| "Bad UTF-8".to_string())
}

pub fn load_or_create_key(key_path: &std::path::Path) -> Result<Vec<u8>, String> {
    if key_path.exists() {
        let bytes = std::fs::read(key_path).map_err(|e| e.to_string())?;
        if bytes.len() == 32 {
            return Ok(bytes);
        }
    }
    let rng = SystemRandom::new();
    let mut key = vec![0u8; 32];
    rng.fill(&mut key).map_err(|_| "Key gen failed".to_string())?;
    std::fs::write(key_path, &key).map_err(|e| e.to_string())?;
    // Attempt to restrict permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(key_path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(key)
}
