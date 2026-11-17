from .cloud_client import text

def request_claude(prompt,max_tokens=1800):
    return text('claude_sonnet',prompt,max_tokens)
