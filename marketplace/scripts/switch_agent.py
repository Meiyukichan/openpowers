#!/usr/bin/env python3

import os
import sys
import re
import subprocess
import logging
from datetime import datetime

def setup_logger():
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    log_file = os.path.join(os.path.expanduser('~'), '.openpowers', 'logs', 'hooks.log')
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s %(levelname)s %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger

def parse_session_id(input_data):
    pattern_session = r'"session_id"\s*:\s*"([a-zA-Z0-9-]+)"'
    match = re.search(pattern_session, input_data, re.IGNORECASE)
    if match:
        return match.group(1)
    return None

def parse_openpowers(input_data):
    pattern_openpowers = r'OpenPowers:\s*([a-zA-Z]+)\s*:Purpose'
    match = re.search(pattern_openpowers, input_data, re.IGNORECASE)
    if match:
        return str(match.group(1)).lower()
    return None

def parse_cwd(input_data):
    pattern_cwd = r'"cwd"\s*:\s*"([^"]+)"'
    match = re.search(pattern_cwd, input_data, re.IGNORECASE)
    if match:
        return match.group(1)
    return None

def main():
    logger = setup_logger()
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            return
        session_id = parse_session_id(input_data)
        openpowers_purpose = parse_openpowers(input_data)
        cwd = parse_cwd(input_data)
        logger.info(f'Acceped hook request  --- session-id : {str(session_id)}')
        logger.info(f'Acceped hook request  --- openpowers-purpose : {str(openpowers_purpose)}')
        logger.info(f'Acceped hook request  --- cwd : {str(cwd)}')
        if not session_id or not openpowers_purpose or not cwd or not os.path.exists(cwd):
            return
        result = subprocess.run(['openpowers', 'agents', 'switch', openpowers_purpose, '--session', session_id], cwd=cwd, capture_output=True, text=True, shell=True)
        logger.info(f'Result of switch-agent hook: {result}')
    except Exception as exp:
        logger.error(f'Failed to execute switch-agent hook: {exp}')

if __name__ == "__main__":
    main()
