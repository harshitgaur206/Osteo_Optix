import os
import requests
from typing import Dict, Any, Optional

BHASHINI_USER_ID = os.getenv("BHASHINI_USER_ID", "")
BHASHINI_API_KEY = os.getenv("BHASHINI_API_KEY", "")

PIPELINE_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
INFERENCE_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

# In-memory pipeline config cache
_pipeline_config_cache: Optional[Dict[str, Any]] = None

def is_bhashini_available() -> bool:
    return bool(BHASHINI_USER_ID and BHASHINI_API_KEY)

def get_pipeline_config() -> Optional[Dict[str, Any]]:
    global _pipeline_config_cache
    if _pipeline_config_cache is not None:
        return _pipeline_config_cache

    if not is_bhashini_available():
        return None

    headers = {
        "Content-Type": "application/json",
        "userID": BHASHINI_USER_ID,
        "ulcaApiKey": BHASHINI_API_KEY
    }
    payload = {
        "pipelineTasks": [
            {"taskType": "translation"},
            {"taskType": "tts"}
        ],
        "pipelineRequestConfig": {
            "pipelineId": "64392f96daac500b55c543cd"
        }
    }

    try:
        response = requests.post(PIPELINE_CONFIG_URL, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            _pipeline_config_cache = response.json()
            return _pipeline_config_cache
    except Exception as e:
        print(f"Bhashini pipeline config error: {e}")
    return None

def translate_text(text: str, target_lang: str, source_lang: str = "en") -> Dict[str, Any]:
    if not is_bhashini_available():
        return {"available": False, "translated_text": text, "message": "BHASHINI_USER_ID/BHASHINI_API_KEY not set"}

    config = get_pipeline_config()
    if not config or "pipelineInferenceAPIEndPoint" not in config:
        return {"available": False, "translated_text": text, "message": "Failed to retrieve Bhashini pipeline config"}

    auth_token = config.get("pipelineInferenceAPIEndPoint", {}).get("inferenceApiKey", {}).get("value", "")
    callback_url = config.get("pipelineInferenceAPIEndPoint", {}).get("callbackUrl", INFERENCE_URL)

    headers = {
        "Content-Type": "application/json",
        "Authorization": auth_token
    }

    # Locate translation task config
    service_id = ""
    for task in config.get("pipelineResponseConfig", []):
        if task.get("taskType") == "translation":
            service_id = task.get("config", [{}])[0].get("serviceId", "")
            break

    payload = {
        "pipelineTasks": [
            {
                "taskType": "translation",
                "config": {
                    "language": {
                        "sourceLanguage": source_lang,
                        "targetLanguage": target_lang
                    },
                    "serviceId": service_id
                }
            }
        ],
        "inputData": {
            "input": [
                {"source": text}
            ]
        }
    }

    try:
        res = requests.post(callback_url, json=payload, headers=headers, timeout=12)
        if res.status_code == 200:
            res_json = res.json()
            translated = res_json.get("pipelineResponse", [{}])[0].get("output", [{}])[0].get("target", text)
            return {"available": True, "translated_text": translated}
    except Exception as e:
        print(f"Bhashini translation request error: {e}")

    return {"available": False, "translated_text": text, "error": "Inference request failed"}

def generate_tts_audio(text: str, language: str = "as") -> Dict[str, Any]:
    if not is_bhashini_available():
        return {"available": False, "audio_base64": None, "message": "BHASHINI_USER_ID/BHASHINI_API_KEY not set"}

    config = get_pipeline_config()
    if not config:
        return {"available": False, "audio_base64": None, "message": "Failed to retrieve Bhashini pipeline config"}

    auth_token = config.get("pipelineInferenceAPIEndPoint", {}).get("inferenceApiKey", {}).get("value", "")
    callback_url = config.get("pipelineInferenceAPIEndPoint", {}).get("callbackUrl", INFERENCE_URL)

    headers = {
        "Content-Type": "application/json",
        "Authorization": auth_token
    }

    service_id = ""
    for task in config.get("pipelineResponseConfig", []):
        if task.get("taskType") == "tts":
            service_id = task.get("config", [{}])[0].get("serviceId", "")
            break

    payload = {
        "pipelineTasks": [
            {
                "taskType": "tts",
                "config": {
                    "language": {
                        "sourceLanguage": language
                    },
                    "serviceId": service_id,
                    "gender": "female"
                }
            }
        ],
        "inputData": {
            "input": [
                {"source": text}
            ]
        }
    }

    try:
        res = requests.post(callback_url, json=payload, headers=headers, timeout=12)
        if res.status_code == 200:
            res_json = res.json()
            audio_content = res_json.get("pipelineResponse", [{}])[0].get("audio", [{}])[0].get("audioContent", None)
            return {"available": True, "audio_base64": audio_content}
    except Exception as e:
        print(f"Bhashini TTS request error: {e}")

    return {"available": False, "audio_base64": None, "error": "TTS request failed"}
