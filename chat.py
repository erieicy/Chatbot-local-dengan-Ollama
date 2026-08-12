import ollama

try:
    response = ollama.chat(
        model='llama3.2:1b', 
        messages=[
            {
                'role': 'user',
                'content': 'Kenapa langit warnaya biru?',
            },
        ]
    )
    print(response['message']['content'])

except Exception as e:
    print(f"Pesan Error: {e}")