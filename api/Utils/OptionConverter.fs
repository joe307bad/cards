module Utils.OptionConverter

open Newtonsoft.Json
open System

type OptionConverter() =
    inherit JsonConverter()

    override _.CanConvert(objectType: Type) =
        objectType.IsGenericType
        && objectType.GetGenericTypeDefinition() = typedefof<option<_>>

    override _.WriteJson(writer: JsonWriter, value: obj, serializer: JsonSerializer) =
        match value with
        | null -> writer.WriteNull()
        | _ ->
            let optionType = value.GetType()
            let someValue = optionType.GetProperty("Value").GetValue(value)

            if someValue = null then
                writer.WriteNull()
            else
                serializer.Serialize(writer, someValue)

    override _.ReadJson(reader: JsonReader, objectType: Type, existingValue: obj, serializer: JsonSerializer) =
        if reader.TokenType = JsonToken.Null then
            null
        else
            let innerType = objectType.GetGenericArguments().[0]
            let value = serializer.Deserialize(reader, innerType)
            let someMethod = objectType.GetMethod("Some")
            someMethod.Invoke(null, [| value |])