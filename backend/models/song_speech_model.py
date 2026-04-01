import torch.nn as nn
from models.cnn_backbone import CNNBackbone


class SongSpeechModel(nn.Module):
    def __init__(self):
        super(SongSpeechModel, self).__init__()

        self.backbone = CNNBackbone()

        self.classifier = nn.Sequential(
            nn.Linear(self.backbone.flatten_size, 512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, 2)
        )

    def forward(self, x):
        features = self.backbone(x)
        output = self.classifier(features)
        return output
